export function compareAnalysisSummaries(before, after) {
  if (!before || !after) return null;
  const beforeFindings = before.findings || [];
  const afterFindings = after.findings || [];
  const beforeById = new Map(beforeFindings.map((finding) => [finding.id, finding]));
  const afterById = new Map(afterFindings.map((finding) => [finding.id, finding]));
  const beforeChecks = new Map((before.checks || []).map((check) => [check.id, check.status]));

  return {
    before,
    after,
    scoreDelta: after.score - before.score,
    statusChanged: before.status !== after.status,
    resolvedFindings: beforeFindings.filter((finding) => !afterById.has(finding.id)),
    newFindings: afterFindings.filter((finding) => !beforeById.has(finding.id)),
    remainingFindings: afterFindings,
    remainingBlockers: afterFindings.filter((finding) =>
      finding.status === "OPEN" && ["CRITICAL", "HIGH"].includes(finding.severity),
    ),
    changedChecks: (after.checks || [])
      .filter((check) => beforeChecks.get(check.id) !== check.status)
      .map((check) => ({
        ...check,
        beforeStatus: beforeChecks.get(check.id) || "NOT RUN",
        afterStatus: check.status,
      })),
  };
}
