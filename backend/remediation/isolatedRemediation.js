import { cp, rm, access } from "node:fs/promises";
import { resolveWorkspacePath, WORKSPACES_ROOT } from "../repositories/workspace.js";
import { analyzeRepository } from "../analyzer/index.js";
import { detectStack } from "../analyzer/stackDetector.js";
import { runValidation } from "../runners/index.js";
import { applyCandidatePatch } from "./patcher.js";
import { REMEDIATION_STATUS } from "./types.js";
import { ApiError } from "../apiErrors.js";

/**
 * Runs remediation in isolated before/after workspaces without touching the original repository.
 *
 * @param {Object} params
 * @param {string} params.jobId
 * @param {Object} params.candidate
 * @param {Object} [params.finding]
 * @param {Object} [params.job]
 * @param {Object} [params.options]
 * @returns {Promise<Object>} Execution report
 */
export async function executeIsolatedRemediation({
  jobId,
  candidate,
  finding = null,
  job = null,
  workspaceRoot = WORKSPACES_ROOT,
  remediationStore = null,
  analyze = analyzeRepository,
  detectRepoStack = detectStack,
  runValidate = runValidation,
}) {
  if (!jobId) throw new ApiError(400, "INVALID_JOB_ID", "Job ID is required.");
  if (!candidate) throw new ApiError(400, "CANDIDATE_REQUIRED", "Remediation candidate is required.");

  const originalWsPath = resolveWorkspacePath(jobId, workspaceRoot);
  try {
    await access(originalWsPath);
  } catch {
    throw new ApiError(404, "WORKSPACE_NOT_FOUND", `Original workspace for job '${jobId}' not found.`);
  }

  const beforeJobId = `${jobId}-before`;
  const afterJobId = `${jobId}-after`;
  const beforeWsPath = resolveWorkspacePath(beforeJobId, workspaceRoot);
  const afterWsPath = resolveWorkspacePath(afterJobId, workspaceRoot);

  // Clean up previous isolated workspaces if they exist
  await rm(beforeWsPath, { recursive: true, force: true });
  await rm(afterWsPath, { recursive: true, force: true });

  // 1. Duplicate original repository into isolated before and after workspaces
  await cp(originalWsPath, beforeWsPath, { recursive: true });
  await cp(originalWsPath, afterWsPath, { recursive: true });

  // Baseline analysis on before workspace
  const beforeAnalysis = await analyze(beforeWsPath, {
    project: {
      name: job?.repositoryName || "Repository",
      repository: job?.repositoryUrl || "workspace",
    },
  });
  const scoreBefore = beforeAnalysis.score;

  // 2. Apply ONLY the proposed patch to the after workspace
  let changedFiles = [];
  let diff = "";
  try {
    const patchResult = await applyCandidatePatch(afterWsPath, candidate, finding);
    changedFiles = patchResult.changedFiles;
    diff = patchResult.diff;
  } catch (patchErr) {
    if (remediationStore) {
      remediationStore.update(candidate.remediationId, {
        status: REMEDIATION_STATUS.PATCH_FAILED,
        error: patchErr.message,
      });
    }

    throw new ApiError(
      422,
      "PATCH_FAILED",
      `Failed to apply remediation patch: ${patchErr.message}`,
      "Ensure the patch target files and diff format match the repository.",
    );
  }

  // 3. Run deterministic validation again in the after workspace
  const afterStack = await detectRepoStack(afterWsPath).catch(() => []);
  const validation = await runValidate({
    workspacePath: afterWsPath,
    ecosystems: afterStack,
  });

  // Run deterministic analysis in after workspace
  const afterAnalysis = await analyze(afterWsPath, {
    project: {
      name: job?.repositoryName || "Repository",
      repository: job?.repositoryUrl || "workspace",
    },
  });
  const scoreAfter = afterAnalysis.score;

  // 4. Compute resolved and remaining findings
  const beforeFindingIds = new Set((beforeAnalysis.findings || []).map((f) => f.id));
  const afterFindingIds = new Set((afterAnalysis.findings || []).map((f) => f.id));
  const resolvedFindings = (beforeAnalysis.findings || []).filter((f) => !afterFindingIds.has(f.id));
  const remainingFindings = afterAnalysis.findings || [];

  // 5. Determine final remediation status
  // "Never mark a remediation successful merely because the patch applied."
  let status = REMEDIATION_STATUS.VALIDATED;

  const isValidationFailed =
    validation?.status === "FAIL" ||
    validation?.status === "TIMEOUT" ||
    (validation?.summary && validation.summary.failed > 0) ||
    (validation?.summary && validation.summary.timeouts > 0);

  const isTargetFindingResolved =
    resolvedFindings.some(
      (f) =>
        f.id === candidate.findingId ||
        f.ruleId === finding?.ruleId ||
        (candidate.findingId && f.id.startsWith(candidate.findingId.split(":")[0])) ||
        (finding?.id && f.id === finding.id),
    ) || (resolvedFindings.length > 0 && scoreAfter >= scoreBefore);

  if (isValidationFailed || (!isTargetFindingResolved && resolvedFindings.length === 0)) {
    status = REMEDIATION_STATUS.VALIDATION_FAILED;
  }

  if (remediationStore) {
    remediationStore.update(candidate.remediationId, {
      status,
      changedFiles,
      diff,
      validation,
      resolvedFindings,
      remainingFindings,
      scoreBefore,
      scoreAfter,
      appliedAt: new Date().toISOString(),
    });
  }

  return {
    status,
    before: {
      workspace: beforeJobId,
      workspacePath: beforeWsPath,
      score: scoreBefore,
      status: beforeAnalysis.status,
      findings: beforeAnalysis.findings || [],
      checks: beforeAnalysis.checks || [],
      analysis: beforeAnalysis,
    },
    after: {
      workspace: afterJobId,
      workspacePath: afterWsPath,
      score: scoreAfter,
      status: afterAnalysis.status,
      findings: afterAnalysis.findings || [],
      checks: afterAnalysis.checks || [],
      analysis: afterAnalysis,
    },
    diff,
    changedFiles,
    validation,
    resolvedFindings,
    remainingFindings,
    scoreBefore,
    scoreAfter,
  };
}
