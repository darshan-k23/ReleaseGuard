export function getRepositoryIdentifier(analysis) {
  return (
    analysis?.repository?.name ||
    analysis?.project?.name ||
    analysis?.job?.repositoryName ||
    analysis?.project?.repository ||
    "workspace"
  );
}

export function formatRepositoryLabel(analysis) {
  const name = getRepositoryIdentifier(analysis);
  return name.endsWith("/") ? name : `${name}/`;
}

export function buildAnalysisPrompt(analysis, finding) {
  const repoLabel = formatRepositoryLabel(analysis);
  const findingContext = finding
    ? `Selected finding:\nRule: ${finding.ruleId}\nSeverity: ${finding.severity}\nCategory: ${finding.category}\nFile: ${finding.affectedFile}:${finding.startLine}-${finding.endLine}\nEvidence: ${finding.evidence}\nExplanation: ${finding.explanation}\nRelease impact: ${finding.risk}`
    : "No individual finding is selected. Inspect the current blockers listed below.";
  const blockers = analysis?.findings
    ?.filter((item) => item.status === "OPEN" && ["CRITICAL", "HIGH"].includes(item.severity))
    .map((item) => `- ${item.ruleId} ${item.severity}: ${item.affectedFile}:${item.startLine} — ${item.evidence}`)
    .join("\n") || "- No open high/critical blockers.";

  return `You are IBM Bob assisting the developer in a human-in-the-loop workflow. ReleaseGuard does not invoke IBM Bob or delegate work to you.\n\nRepository: ${repoLabel} (inspect this repository only)\nReleaseGuard analysis ID: ${analysis?.analysisId || ""}\nCurrent release status: ${analysis?.status || analysis?.releaseDecision || ""}\n\nInspect the repository and relevant files independently. Verify whether the finding below is real. Cite exact file paths and line numbers for all evidence, explain release impact, and avoid unrelated changes. Do not invent findings or assume a clean result. Do not use or request real secrets.\n\n${findingContext}\n\nCurrent blockers from this analysis:\n${blockers}\n\nReturn: verification result, exact evidence, release impact, and a narrowly scoped remediation proposal. Do not modify files until the developer approves the proposed change.`;
}

export function buildFixPrompt(finding, analysis) {
  if (!finding) return "Select a finding in ReleaseGuard before generating a Bob fix prompt.";
  const repoLabel = formatRepositoryLabel(analysis);
  return `You are IBM Bob performing an agentic remediation under developer supervision. ReleaseGuard does not invoke IBM Bob.\n\nRepository: ${repoLabel}\nBaseline analysis ID: ${analysis?.analysisId || ""}\nFinding: ${finding.ruleId} (${finding.severity}, ${finding.category})\nTitle: ${finding.title}\nFile and line: ${finding.affectedFile}:${finding.startLine}-${finding.endLine}\nEvidence: ${finding.evidence}\nRisk: ${finding.risk}\nRecommended direction: ${finding.recommendedFix}\n\nFix ONLY this issue. Do not perform unrelated cleanup. Preserve every other intentional baseline issue and existing behavior. Explain the change, run the relevant validation command, and report your result using exactly these sections:\n\nBEFORE\nCHANGE\nVALIDATION\nAFTER\n\nCite files changed and exact validation commands/results. Never add real credentials or secrets.`;
}
