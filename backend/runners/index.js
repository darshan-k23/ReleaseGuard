/**
 * ReleaseGuard Runners module
 * Foundation for executing analysis tools and runners on repository workspaces.
 */
export const RUNNER_STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

export {
  VALIDATION_STATUS,
  runValidation,
  executeValidationCommand,
  createNotRunExecution,
  findExecutable,
} from "./validationRunner.js";
