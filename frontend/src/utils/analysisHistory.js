export const ANALYSIS_HISTORY_KEY = "releaseguard.analysis-history.v1";
export const MAX_ANALYSIS_HISTORY = 10;

function minimalFinding(finding) {
  return {
    id: String(finding.id || ""),
    ruleId: String(finding.ruleId || ""),
    title: String(finding.title || ""),
    category: String(finding.category || ""),
    severity: String(finding.severity || ""),
    status: String(finding.status || ""),
  };
}

function minimalCheck(check) {
  return {
    id: String(check.id || ""),
    category: String(check.category || ""),
    status: String(check.status || ""),
  };
}

export function summarizeAnalysis(analysis) {
  const findings = Array.isArray(analysis.findings) ? analysis.findings : [];
  const checks = Array.isArray(analysis.checks) ? analysis.checks : [];
  return {
    analysisId: String(analysis.analysisId || ""),
    timestamp: String(analysis.analyzedAt || ""),
    score: Number(analysis.score) || 0,
    status: String(analysis.status || "UNKNOWN"),
    blockerCount: findings.filter((finding) =>
      finding.status === "OPEN" && ["CRITICAL", "HIGH"].includes(finding.severity),
    ).length,
    warningCount: findings.filter((finding) =>
      finding.status === "OPEN" && ["MEDIUM", "LOW"].includes(finding.severity),
    ).length,
    projectName: String(analysis.project?.name || "Unknown project"),
    findings: findings.map(minimalFinding),
    checks: checks.map(minimalCheck),
  };
}

function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === "object" && typeof entry.analysisId === "string")
    .map((entry) => ({
      analysisId: String(entry.analysisId),
      timestamp: String(entry.timestamp || ""),
      score: Number(entry.score) || 0,
      status: String(entry.status || "UNKNOWN"),
      blockerCount: Number(entry.blockerCount) || 0,
      warningCount: Number(entry.warningCount) || 0,
      projectName: String(entry.projectName || "Unknown project"),
      findings: Array.isArray(entry.findings) ? entry.findings.map(minimalFinding) : [],
      checks: Array.isArray(entry.checks) ? entry.checks.map(minimalCheck) : [],
    }))
    .slice(0, MAX_ANALYSIS_HISTORY);
}

export function readAnalysisHistory(storage = globalThis.localStorage) {
  try {
    return sanitizeHistory(JSON.parse(storage.getItem(ANALYSIS_HISTORY_KEY) || "[]"));
  } catch {
    return [];
  }
}

export function saveAnalysisSummary(analysis, storage = globalThis.localStorage) {
  const summary = summarizeAnalysis(analysis);
  const history = [
    summary,
    ...readAnalysisHistory(storage).filter((entry) => entry.analysisId !== summary.analysisId),
  ].slice(0, MAX_ANALYSIS_HISTORY);

  try {
    storage.setItem(ANALYSIS_HISTORY_KEY, JSON.stringify(history));
  } catch {
    return history;
  }
  return history;
}
