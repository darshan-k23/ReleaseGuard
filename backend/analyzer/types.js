export const CATEGORIES = [
  "Build",
  "Tests",
  "Security",
  "Dependencies",
  "Configuration",
  "Documentation",
  "Integration",
];

export const CHECK_STATUS = {
  PASS: "PASS",
  FAIL: "FAIL",
  NOT_RUN: "NOT RUN",
};

export const FINDING_STATUS = {
  OPEN: "OPEN",
};

export const SEVERITY = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

export function createCheck({
  id,
  category,
  status,
  summary,
  command = null,
  exitCode = null,
  stdout = "",
  stderr = "",
  durationMs = 0,
  reason = null,
  timedOut = false,
  testsRun = 0,
  testsPassed = 0,
  testsFailed = 0,
}) {
  if (!Object.values(CHECK_STATUS).includes(status)) {
    throw new TypeError(`Unsupported check status: ${status}`);
  }

  return {
    id,
    category,
    status,
    summary,
    command,
    exitCode,
    stdout,
    stderr,
    durationMs,
    reason,
    timedOut,
    testsRun,
    testsPassed,
    testsFailed,
  };
}
