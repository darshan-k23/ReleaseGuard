import { CHECK_STATUS } from "./types.js";

export const SCORE_METHOD = {
  name: "Deterministic severity-weighted heuristic",
  baseScore: 100,
  deductions: {
    CRITICAL: 30,
    HIGH: 15,
    MEDIUM: 5,
    LOW: 2,
  },
  releaseGate:
    "Any open critical/high finding or failed build/test check blocks release review.",
  disclaimer:
    "This is a transparent demo heuristic, not an industry-standard metric or production certification.",
};

export function computeScore(findings) {
  const deduction = findings.reduce(
    (total, finding) => {
      if (finding.status && finding.status !== "OPEN") return total;
      return total + (SCORE_METHOD.deductions[finding.severity] || 0);
    },
    0,
  );
  return Math.max(0, Math.min(100, SCORE_METHOD.baseScore - deduction));
}

export function deriveReleaseStatus(findings, checks) {
  const hasBlockingFinding = findings.some(
    (finding) =>
      finding.status === "OPEN" &&
      ["CRITICAL", "HIGH"].includes(finding.severity),
  );
  const hasFailedValidation = checks.some(
    (check) =>
      ["Build", "Tests"].includes(check.category) &&
      check.status === CHECK_STATUS.FAIL,
  );

  if (hasBlockingFinding || hasFailedValidation) return "RELEASE BLOCKED";
  if (checks.some((check) => check.status === CHECK_STATUS.NOT_RUN)) {
    return "VALIDATION INCOMPLETE";
  }
  return "READY FOR REVIEW";
}
