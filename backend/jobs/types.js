import crypto from "node:crypto";

export const JOB_STATUS = {
  CREATED: "CREATED",
  CLONING: "CLONING",
  CLONED: "CLONED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

export const JOB_SOURCE = {
  GITHUB: "github",
};

export function createRepositoryJob({
  jobId = crypto.randomUUID(),
  repositoryUrl,
  repositoryName = null,
  source = JOB_SOURCE.GITHUB,
  branch = null,
  commitSha = null,
  workspacePath = null,
  createdAt = new Date().toISOString(),
  startedAt = null,
  completedAt = null,
  error = null,
  status = JOB_STATUS.CREATED,
  stack = null,
  validation = null,
  analysis = null,
  assessment = null,
} = {}) {
  if (!repositoryUrl) {
    throw new TypeError("repositoryUrl is required to create a repository job");
  }

  const base = {
    jobId,
    status,
    source,
    repositoryUrl,
    repositoryName,
    branch,
    commitSha,
    workspacePath,
    createdAt,
    startedAt,
    completedAt,
    error,
    validation,
  };

  if (stack !== null) base.stack = stack;
  if (analysis !== null) base.analysis = analysis;
  if (assessment !== null) base.assessment = assessment;

  return base;
}
