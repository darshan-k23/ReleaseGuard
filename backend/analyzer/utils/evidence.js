import { createHash } from "node:crypto";

export function createFindingFingerprint(ruleId, affectedFile, evidence) {
  const normalizedEvidence = String(evidence).trim().replace(/\s+/g, " ");
  return createHash("sha256")
    .update(`${ruleId}\0${affectedFile}\0${normalizedEvidence}`)
    .digest("hex");
}

export function createRelatedEvidence(context, affectedFile, lineNumber) {
  const source = context.byPath.get(affectedFile);
  if (!source || !Number.isInteger(lineNumber) || lineNumber < 1) {
    throw new Error(`Evidence source is unavailable: ${affectedFile}:${lineNumber}`);
  }

  const line = source.lines[lineNumber - 1];
  if (line === undefined || !line.trim()) {
    throw new Error(`Evidence line is empty: ${affectedFile}:${lineNumber}`);
  }

  return {
    affectedFile,
    startLine: lineNumber,
    endLine: lineNumber,
    evidence: line.trim(),
  };
}

export function findLine(source, matcher) {
  if (!source) return null;
  const index = source.lines.findIndex((line) =>
    typeof matcher === "function" ? matcher(line) : matcher.test(line),
  );
  return index < 0 ? null : index + 1;
}

export function createFinding(context, details) {
  const targetFile = details.file || details.affectedFile;
  const evidence = createRelatedEvidence(
    context,
    targetFile,
    details.startLine,
  );
  const relatedEvidence = (details.relatedEvidence || []).map((item) =>
    createRelatedEvidence(context, item.file || item.affectedFile, item.startLine),
  );
  const evidenceFingerprint = createFindingFingerprint(
    details.ruleId,
    evidence.affectedFile,
    evidence.evidence,
  );

  return {
    id: `${details.ruleId}:${evidenceFingerprint.slice(0, 20)}`,
    evidenceFingerprint,
    ruleId: details.ruleId,
    category: details.category,
    severity: details.severity,
    status: "OPEN",
    title: details.title,
    file: evidence.affectedFile,
    affectedFile: evidence.affectedFile,
    startLine: evidence.startLine,
    endLine: evidence.endLine,
    evidence: evidence.evidence,
    relatedEvidence,
    explanation: details.explanation,
    risk: details.risk,
    recommendedFix: details.recommendedFix,
    confidence: details.confidence ?? 0.9,
    remediationHint: details.remediationHint,
  };
}
