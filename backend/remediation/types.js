import crypto from "node:crypto";

export const REMEDIATION_STATUS = {
  PROPOSED: "PROPOSED",
  APPLIED: "APPLIED",
  REJECTED: "REJECTED",
  PATCH_FAILED: "PATCH_FAILED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  VALIDATED: "VALIDATED",
};

export function createRemediationCandidate({
  remediationId = crypto.randomUUID(),
  jobId,
  findingId,
  patch = "",
  files = [],
  diagnosis = "",
  plan = [],
  proposedChanges = [],
  validationPlan = [],
  createdAt = new Date().toISOString(),
  status = REMEDIATION_STATUS.PROPOSED,
} = {}) {
  if (!jobId) throw new TypeError("jobId is required for remediation candidate");
  if (!findingId) throw new TypeError("findingId is required for remediation candidate");
  if (!Object.values(REMEDIATION_STATUS).includes(status)) {
    throw new TypeError(`Invalid remediation status: ${status}`);
  }

  return {
    remediationId,
    jobId,
    findingId,
    patch: typeof patch === "string" ? patch : JSON.stringify(patch, null, 2),
    files: Array.isArray(files) ? files : [],
    diagnosis,
    plan,
    proposedChanges,
    validationPlan,
    createdAt,
    status,
  };
}
