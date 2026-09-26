import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError, apiErrorHandler, notFoundHandler } from "./apiErrors.js";
import { analyzeRepository, getProjectMetadata, detectStack } from "./analyzer/index.js";
import { JOB_STATUS, defaultJobStore } from "./jobs/index.js";
import {
  validateGitHubUrl,
  createWorkspace,
  removeWorkspace,
  workspaceExists,
  resolveWorkspacePath,
  cloneRepository,
  getSafeFileTree,
  sanitizeErrorOutput,
} from "./repositories/index.js";
import { runValidation } from "./runners/index.js";

export function createApp({
  analyze = analyzeRepository,
  getProject = getProjectMetadata,
  jobStore = defaultJobStore,
  cloneRepo = cloneRepository,
  getFileTree = getSafeFileTree,
  detectRepoStack = detectStack,
  runValidate = runValidation,
} = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "8kb" }));

  let latestAnalysis = null;
  let analysisInProgress = false;

  function requireLatestAnalysis() {
    if (!latestAnalysis) {
      throw new ApiError(
        404,
        "ANALYSIS_NOT_FOUND",
        "No repository analysis has been run yet",
        "Run POST /api/analyze before requesting the latest result.",
      );
    }
    return latestAnalysis;
  }

  app.get("/api/project", async (req, res, next) => {
    try {
      res.json(latestAnalysis?.project || await getProject());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/release-report", (req, res, next) => {
    try {
      const { status, statusSummary, score, scoreMethod, categories, metrics } = requireLatestAnalysis();
      res.json({ status, statusSummary, score, scoreMethod, categories, metrics });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/issues", (req, res, next) => {
    try {
      res.json(requireLatestAnalysis().findings);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/release-plan", (req, res, next) => {
    try {
      res.json(requireLatestAnalysis().releasePlan);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/analysis/latest", (req, res, next) => {
    try {
      res.json(requireLatestAnalysis());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/analyze", async (req, res, next) => {
    if (analysisInProgress) {
      next(new ApiError(
        409,
        "ANALYSIS_IN_PROGRESS",
        "A repository analysis is already running",
        "Wait for the active ShopSphere analysis to finish.",
      ));
      return;
    }

    analysisInProgress = true;
    try {
      latestAnalysis = await analyze();
      res.json(latestAnalysis);
    } catch (error) {
      next(error);
    } finally {
      analysisInProgress = false;
    }
  });

  app.post("/api/jobs", async (req, res, next) => {
    try {
      const { repositoryUrl, branch } = req.body || {};
      const { repo, normalizedUrl } = validateGitHubUrl(repositoryUrl);

      const job = jobStore.create({
        repositoryUrl: normalizedUrl,
        repositoryName: repo,
        branch: typeof branch === "string" && branch.trim() ? branch.trim() : null,
      });

      const workspacePath = await createWorkspace(job.jobId);

      jobStore.update(job.jobId, {
        status: JOB_STATUS.CLONING,
        workspacePath,
        startedAt: new Date().toISOString(),
      });

      try {
        const cloneResult = await cloneRepo({
          repositoryUrl: normalizedUrl,
          workspacePath,
          branch: job.branch,
        });

        const updatedJob = jobStore.update(job.jobId, {
          status: JOB_STATUS.CLONED,
          repositoryName: repo,
          branch: cloneResult.branch || job.branch || "main",
          commitSha: cloneResult.commitSha,
          completedAt: new Date().toISOString(),
        });

        res.status(201).json({
          jobId: updatedJob.jobId,
          status: updatedJob.status,
        });
      } catch (cloneErr) {
        const sanitizedErr = sanitizeErrorOutput(cloneErr?.message || "Repository clone failed.");
        const failedJob = jobStore.update(job.jobId, {
          status: JOB_STATUS.FAILED,
          error: sanitizedErr,
          completedAt: new Date().toISOString(),
        });

        await removeWorkspace(job.jobId).catch(() => {});

        res.status(201).json({
          jobId: failedJob.jobId,
          status: failedJob.status,
          error: sanitizedErr,
        });
      }
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/jobs/:jobId", (req, res, next) => {
    try {
      const { jobId } = req.params;
      const job = jobStore.get(jobId);
      if (!job) {
        throw new ApiError(
          404,
          "JOB_NOT_FOUND",
          `Job '${jobId}' not found`,
          "Check the jobId and try again.",
        );
      }
      res.json(job);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/jobs/:jobId", async (req, res, next) => {
    try {
      const { jobId } = req.params;
      const job = jobStore.get(jobId);
      if (!job) {
        throw new ApiError(
          404,
          "JOB_NOT_FOUND",
          `Job '${jobId}' not found`,
          "Check the jobId and try again.",
        );
      }

      await removeWorkspace(jobId).catch(() => {});
      jobStore.delete(jobId);

      res.json({
        jobId,
        deleted: true,
        message: `Workspace for job '${jobId}' has been removed.`,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/jobs/:jobId/files", async (req, res, next) => {
    try {
      const { jobId } = req.params;
      const job = jobStore.get(jobId);
      if (!job) {
        throw new ApiError(
          404,
          "JOB_NOT_FOUND",
          `Job '${jobId}' not found`,
          "Check the jobId and try again.",
        );
      }

      if (job.status === JOB_STATUS.FAILED) {
        throw new ApiError(
          400,
          "JOB_FAILED",
          "Repository clone failed for this job.",
          job.error || "Check the job details for error information.",
        );
      }

      if (job.status !== JOB_STATUS.CLONED) {
        throw new ApiError(
          409,
          "JOB_NOT_READY",
          `Job is currently ${job.status}.`,
          "Wait for the job to reach CLONED status before requesting files.",
        );
      }

      const exists = await workspaceExists(jobId);
      if (!exists) {
        throw new ApiError(
          404,
          "WORKSPACE_NOT_FOUND",
          "Workspace directory not found on disk.",
          "The workspace may have been removed.",
        );
      }

      const workspacePath = resolveWorkspacePath(jobId);
      const safeTree = await getFileTree(workspacePath);

      res.json({
        jobId,
        repositoryName: job.repositoryName || null,
        ...safeTree,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/jobs/:jobId/stack", async (req, res, next) => {
    try {
      const { jobId } = req.params;
      const job = jobStore.get(jobId);
      if (!job) {
        throw new ApiError(
          404,
          "JOB_NOT_FOUND",
          `Job '${jobId}' not found`,
          "Check the jobId and try again.",
        );
      }

      if (job.status === JOB_STATUS.FAILED) {
        throw new ApiError(
          400,
          "JOB_FAILED",
          "Repository clone failed for this job.",
          job.error || "Check the job details for error information.",
        );
      }

      if (job.status !== JOB_STATUS.CLONED) {
        throw new ApiError(
          409,
          "JOB_NOT_READY",
          `Job is currently ${job.status}.`,
          "Wait for the job to reach CLONED status before requesting stack detection.",
        );
      }

      const exists = await workspaceExists(jobId);
      if (!exists) {
        throw new ApiError(
          404,
          "WORKSPACE_NOT_FOUND",
          "Workspace directory not found on disk.",
          "The workspace may have been removed.",
        );
      }

      const workspacePath = resolveWorkspacePath(jobId);
      const ecosystems = await detectRepoStack(workspacePath);

      res.json({
        jobId,
        ecosystems,
        stack: ecosystems,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/jobs/:jobId/validate", async (req, res, next) => {
    try {
      const { jobId } = req.params;
      const job = jobStore.get(jobId);
      if (!job) {
        throw new ApiError(
          404,
          "JOB_NOT_FOUND",
          `Job '${jobId}' not found`,
          "Check the jobId and try again.",
        );
      }

      if (job.status === JOB_STATUS.FAILED) {
        throw new ApiError(
          400,
          "JOB_FAILED",
          "Repository clone failed for this job.",
          job.error || "Check the job details for error information.",
        );
      }

      if (job.status !== JOB_STATUS.CLONED) {
        throw new ApiError(
          409,
          "JOB_NOT_READY",
          `Job is currently ${job.status}.`,
          "Wait for the job to reach CLONED status before requesting validation.",
        );
      }

      const exists = await workspaceExists(jobId);
      if (!exists) {
        throw new ApiError(
          404,
          "WORKSPACE_NOT_FOUND",
          "Workspace directory not found on disk.",
          "The workspace may have been removed.",
        );
      }

      const workspacePath = resolveWorkspacePath(jobId);

      // Mark the job RUNNING immediately. Since the only way back to CLONED
      // is a fresh clone, this also blocks a second /validate call on the
      // same job from racing this one.
      jobStore.update(jobId, {
        status: JOB_STATUS.RUNNING,
        startedAt: job.startedAt || new Date().toISOString(),
      });

      let ecosystems;
      let validationResult;
      try {
        ecosystems = await detectRepoStack(workspacePath);
        validationResult = await runValidate({ workspacePath, ecosystems });
      } catch (validationErr) {
        // The validation *infrastructure* failed unexpectedly (e.g. detection
        // threw). This is distinct from a normal FAIL/TIMEOUT/NOT_RUN outcome,
        // which runValidate reports as structured evidence, never as a thrown error.
        const sanitizedErr = sanitizeErrorOutput(
          validationErr?.message || "Validation failed to run.",
        );
        const failedJob = jobStore.update(jobId, {
          status: JOB_STATUS.FAILED,
          error: sanitizedErr,
          completedAt: new Date().toISOString(),
        });

        res.status(200).json({
          jobId: failedJob.jobId,
          status: failedJob.status,
          error: sanitizedErr,
        });
        return;
      }

      const updatedJob = jobStore.update(jobId, {
        status: JOB_STATUS.COMPLETED,
        validation: validationResult,
        completedAt: new Date().toISOString(),
      });

      res.json({
        jobId: updatedJob.jobId,
        status: updatedJob.status,
        stack: ecosystems,
        validation: validationResult,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use(notFoundHandler);
  app.use(apiErrorHandler);
  return app;
}

export function startServer({ port = process.env.PORT || 8090, host = "127.0.0.1" } = {}) {
  const app = createApp();
  const server = app.listen(port, host, () => {
    console.log(`ReleaseGuard backend listening on http://${host}:${server.address().port}`);
  });
  return server;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === currentFile) startServer();
