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
import { requestReleaseAssessment, getSafeReleaseAssessment, requestRemediationPlan } from "./llmClient.js";
import { defaultRemediationStore, executeIsolatedRemediation } from "./remediation/index.js";
import { readFile, cp } from "node:fs/promises";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const DEMO_REPOSITORIES_ROOT = path.resolve(currentDir, "..", "demo-repositories");
const DEMO_PROJECT_ROOT = path.resolve(currentDir, "..", "demo-project");

export function createApp({
  analyze = analyzeRepository,
  getProject = getProjectMetadata,
  jobStore = defaultJobStore,
  remediationStore = defaultRemediationStore,
  cloneRepo = cloneRepository,
  getFileTree = getSafeFileTree,
  detectRepoStack = detectStack,
  runValidate = runValidation,
  fetchAssessment = requestReleaseAssessment,
  fetchRemediationPlan = requestRemediationPlan,
  runIsolatedRemediation = executeIsolatedRemediation,
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

  app.get("/api/demo-repositories", (req, res) => {
    res.json([
      {
        id: "ShopSphere",
        name: "ShopSphere (Baseline)",
        description: "Original multi-service baseline with intentional demo issues",
        ecosystem: "Java/Maven + Node/React",
      },
      {
        id: "release-ready",
        name: "Release Ready",
        description: "Clean verified Node.js candidate with all checks passing",
        ecosystem: "Node.js",
      },
      {
        id: "warning-only",
        name: "Warning Only",
        description: "Missing deployment documentation & unlocked dependencies",
        ecosystem: "Node.js",
      },
      {
        id: "configuration-risk",
        name: "Configuration Risk",
        description: "Frontend/backend port mismatch & missing production profile",
        ecosystem: "Node.js",
      },
      {
        id: "security-blocked",
        name: "Security Blocked",
        description: "Committed synthetic credential sentinel & debug logging",
        ecosystem: "Node.js",
      },
      {
        id: "test-failing",
        name: "Test Failing",
        description: "Deterministic test failure",
        ecosystem: "Node.js",
      },
      {
        id: "critically-blocked",
        name: "Critically Blocked",
        description: "Multiple compound blockers across security, config, and validation",
        ecosystem: "Node.js",
      },
    ]);
  });

  app.post("/api/jobs", async (req, res, next) => {
    try {
      const { repositoryUrl, demoName, demoId, branch } = req.body || {};
      const targetDemo = demoId || demoName || (repositoryUrl && repositoryUrl.startsWith("demo:") ? repositoryUrl.slice(5) : null);

      if (targetDemo) {
        const repoName = targetDemo;
        const normalizedUrl = `https://github.com/releaseguard-demo/${targetDemo}`;
        const job = jobStore.create({
          repositoryUrl: normalizedUrl,
          repositoryName: repoName,
          branch: branch || "main",
        });

        const workspacePath = await createWorkspace(job.jobId);
        jobStore.update(job.jobId, {
          status: JOB_STATUS.CLONING,
          workspacePath,
          startedAt: new Date().toISOString(),
        });

        const demoSourcePath = targetDemo.toLowerCase() === "shopsphere"
          ? DEMO_PROJECT_ROOT
          : path.join(DEMO_REPOSITORIES_ROOT, targetDemo);

        try {
          await cp(demoSourcePath, workspacePath, { recursive: true });
          const updatedJob = jobStore.update(job.jobId, {
            status: JOB_STATUS.CLONED,
            repositoryName: repoName,
            branch: branch || "main",
            commitSha: "sha-" + job.jobId.slice(0, 8),
            completedAt: new Date().toISOString(),
          });
          res.status(201).json({
            jobId: updatedJob.jobId,
            status: updatedJob.status,
          });
        } catch (cpErr) {
          const sanitizedErr = sanitizeErrorOutput(cpErr?.message || "Demo repository initialization failed.");
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
        return;
      }

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

  app.post("/api/jobs/:jobId/analyze", async (req, res, next) => {
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

      if (job.status !== JOB_STATUS.CLONED && job.status !== JOB_STATUS.COMPLETED) {
        throw new ApiError(
          409,
          "JOB_NOT_READY",
          `Job is currently ${job.status}.`,
          "Wait for the job to reach CLONED status before requesting analysis.",
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
      const stack = job.stack || (await detectRepoStack(workspacePath).catch(() => []));
      let validation = job.validation;
      if (!validation) {
        try {
          validation = await runValidate({ workspacePath, ecosystems: stack });
          jobStore.update(jobId, { validation });
        } catch {
          validation = null;
        }
      }

      const deterministicAnalysis = await analyze(workspacePath, {
        project: {
          name: job.repositoryName || "Repository",
          repository: job.repositoryUrl || "workspace",
        },
        stack,
        validation,
      });

      // Collect evidence and request structured LLM assessment (non-fatal)
      const llmAssessment = await getSafeReleaseAssessment(
        {
          repository: job.repositoryName || job.repositoryUrl || deterministicAnalysis.project?.name || "workspace",
          stack,
          validation: job.validation || validation || null,
          findings: deterministicAnalysis.findings || [],
          metrics: deterministicAnalysis.metrics || {},
        },
        fetchAssessment,
      );

      const generatedAt = new Date().toISOString();
      const finalAnalysis = {
        ...deterministicAnalysis,
        job: {
          jobId: job.jobId,
          status: job.status,
          repositoryUrl: job.repositoryUrl,
          repositoryName: job.repositoryName,
          branch: job.branch,
          commitSha: job.commitSha,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
        },
        repository: {
          name: job.repositoryName || deterministicAnalysis.project?.name || "Repository",
          url: job.repositoryUrl || null,
          stack,
          description: deterministicAnalysis.project?.description || "Analyzed repository",
        },
        stack,
        checks: deterministicAnalysis.checks || [],
        findings: deterministicAnalysis.findings || [],
        score: deterministicAnalysis.score,
        releaseDecision: deterministicAnalysis.status,
        llmAssessment,
        generatedAt,
      };

      jobStore.update(jobId, {
        stack,
        analysis: finalAnalysis,
        assessment: llmAssessment,
      });

      res.json(finalAnalysis);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/release-assessment", async (req, res, next) => {
    try {
      const payload = req.body || {};
      const assessment = await fetchAssessment(payload);
      res.json(assessment);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/jobs/:jobId/assess", async (req, res, next) => {
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

      if (job.status !== JOB_STATUS.CLONED && job.status !== JOB_STATUS.COMPLETED) {
        throw new ApiError(
          409,
          "JOB_NOT_READY",
          `Job is currently ${job.status}.`,
          "Wait for the job to reach CLONED status before requesting assessment.",
        );
      }

      let analysis = job.analysis;
      if (!analysis) {
        const workspacePath = resolveWorkspacePath(jobId);
        const stack = job.stack || (await detectRepoStack(workspacePath).catch(() => []));
        let validation = job.validation;
        if (!validation) {
          try {
            validation = await runValidate({ workspacePath, ecosystems: stack });
            jobStore.update(jobId, { validation });
          } catch {
            validation = null;
          }
        }
        analysis = await analyze(workspacePath, {
          project: {
            name: job.repositoryName || "Repository",
            repository: job.repositoryUrl || "workspace",
          },
          stack,
          validation,
        });
      }

      const stack = job.stack || analysis.stack || [];
      const llmAssessment = await getSafeReleaseAssessment(
        {
          repository: job.repositoryName || job.repositoryUrl || analysis.project?.name || "workspace",
          stack,
          validation: job.validation || null,
          findings: analysis.findings || [],
          metrics: analysis.metrics || {},
        },
        fetchAssessment,
      );

      const finalAnalysis = {
        ...analysis,
        job: {
          jobId: job.jobId,
          status: job.status,
          repositoryUrl: job.repositoryUrl,
          repositoryName: job.repositoryName,
          branch: job.branch,
          commitSha: job.commitSha,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
        },
        repository: {
          name: job.repositoryName || analysis.project?.name || "Repository",
          url: job.repositoryUrl || null,
          stack,
          description: analysis.project?.description || "Analyzed repository",
        },
        stack,
        checks: analysis.checks || [],
        findings: analysis.findings || [],
        score: analysis.score,
        releaseDecision: analysis.status || analysis.releaseDecision,
        llmAssessment,
        generatedAt: analysis.generatedAt || new Date().toISOString(),
      };

      jobStore.update(jobId, {
        stack,
        analysis: finalAnalysis,
        assessment: llmAssessment,
      });

      res.json(finalAnalysis);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/jobs/:jobId/remediation-plan", async (req, res, next) => {
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

      if (job.status !== JOB_STATUS.CLONED && job.status !== JOB_STATUS.COMPLETED) {
        throw new ApiError(
          409,
          "JOB_NOT_READY",
          `Job is currently ${job.status}.`,
          "Wait for the job to reach CLONED status before requesting a remediation plan.",
        );
      }

      const { findingId, finding: passedFinding } = req.body || {};
      const targetFindingId = findingId || passedFinding?.id;
      if (!targetFindingId && !passedFinding) {
        throw new ApiError(
          400,
          "FINDING_REQUIRED",
          "A findingId or finding object is required to generate a remediation plan.",
          "Provide findingId in the request body.",
        );
      }

      let finding = passedFinding || job.analysis?.findings?.find((f) => f.id === targetFindingId);
      if (!finding) {
        const workspacePath = resolveWorkspacePath(jobId);
        const analysis = await analyze(workspacePath, {
          project: {
            name: job.repositoryName || "Repository",
            repository: job.repositoryUrl || "workspace",
          },
        });
        finding = analysis.findings?.find((f) => f.id === targetFindingId);
      }

      if (!finding) {
        throw new ApiError(
          404,
          "FINDING_NOT_FOUND",
          `Finding '${targetFindingId}' not found in job analysis`,
          "Ensure the finding ID is valid for this repository.",
        );
      }

      const targetFile = finding.file || finding.affectedFile;
      let fileContent = "";
      if (targetFile) {
        try {
          const workspacePath = resolveWorkspacePath(jobId);
          const fullPath = path.resolve(workspacePath, targetFile);
          fileContent = await readFile(fullPath, "utf8");
        } catch {
          fileContent = "";
        }
      }

      const remediationResult = await fetchRemediationPlan({
        finding,
        repository: job.repositoryName || job.repositoryUrl || "workspace",
        stack: job.stack || [],
        fileContent,
      });

      const patch = remediationResult.proposedChanges?.map((c) => c.patch).join("\n\n") || remediationResult.patch || "";
      const files = remediationResult.filesToChange?.length > 0
        ? remediationResult.filesToChange
        : [targetFile].filter(Boolean);

      const candidate = remediationStore.create({
        jobId,
        findingId: finding.id,
        patch,
        files,
        diagnosis: remediationResult.diagnosis,
        plan: remediationResult.plan,
        proposedChanges: remediationResult.proposedChanges,
        validationPlan: remediationResult.validationPlan,
        status: "PROPOSED",
      });

      res.status(201).json(candidate);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/jobs/:jobId/remediation", (req, res, next) => {
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

      const candidates = remediationStore.listForJob(jobId);
      res.json(candidates);
    } catch (error) {
      next(error);
    }
  });

  const handleApplyRemediation = async (req, res, next) => {
    try {
      const { jobId } = req.params;
      const remediationId = req.params.remediationId || req.body?.remediationId;

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

      if (job.status !== JOB_STATUS.CLONED && job.status !== JOB_STATUS.COMPLETED) {
        throw new ApiError(
          409,
          "JOB_NOT_READY",
          `Job is currently ${job.status}.`,
          "Wait for the job to reach CLONED status before applying remediation.",
        );
      }

      if (!remediationId) {
        throw new ApiError(
          400,
          "REMEDIATION_ID_REQUIRED",
          "Remediation ID is required to apply patch candidate.",
          "Provide remediationId in path or body.",
        );
      }

      const candidate = remediationStore.get(remediationId);
      if (!candidate || candidate.jobId !== jobId) {
        throw new ApiError(
          404,
          "REMEDIATION_NOT_FOUND",
          `Remediation candidate '${remediationId}' not found for job '${jobId}'.`,
          "Ensure the candidate was generated via /remediation-plan.",
        );
      }

      const finding = job.analysis?.findings?.find((f) => f.id === candidate.findingId) || null;

      const result = await runIsolatedRemediation({
        jobId,
        candidate,
        finding,
        job,
        remediationStore,
        analyze,
        detectRepoStack,
        runValidate,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  app.post("/api/jobs/:jobId/remediation/:remediationId/apply", handleApplyRemediation);
  app.post("/api/jobs/:jobId/remediation/apply", handleApplyRemediation);

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
