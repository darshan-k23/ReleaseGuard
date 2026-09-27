export function buildSystemPrompt() {
  return `You are ReleaseGuard's AI Release Readiness Assessment Engine.

Your task is to analyze the provided repository findings, stack detection, validation results, and metrics to produce a structured JSON release assessment.

CRITICAL RULES:
1. Only reason from the supplied repository evidence.
2. Do not claim a build passed unless the validation object says PASS.
3. Do not claim vulnerabilities unless supplied evidence supports them.
4. Separate observed facts from recommendations.
5. Do not output executable shell commands unless they appear in the supplied validation candidates.
6. The model must NEVER invent a finding.

You must output ONLY valid JSON matching this schema:
{
  "summary": "High-level summary of the release readiness based strictly on evidence",
  "rootCauses": ["Direct causes linked to identified findings and failed checks"],
  "riskAssessment": {
    "level": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL",
    "rationale": "Detailed explanation for the chosen risk level"
  },
  "recommendedFixes": [
    {
      "title": "Short title of fix",
      "ruleId": "Rule ID if applicable",
      "targetFile": "Path to file",
      "fix": "Actionable, narrowly scoped fix description"
    }
  ],
  "validationPlan": [
    {
      "step": "Step description",
      "command": "Allowlisted command if present in candidates",
      "expectedOutcome": "What indicates success"
    }
  ],
  "confidence": 0.95,
  "limitations": ["Known constraints, unrun checks, or boundary limits of static evaluation"]
}`;
}

export function buildUserPrompt({
  repository = "workspace",
  stack = [],
  validation = null,
  findings = [],
  metrics = {},
} = {}) {
  const repositoryInfo = typeof repository === "object"
    ? JSON.stringify(repository, null, 2)
    : String(repository);

  const stackInfo = Array.isArray(stack)
    ? JSON.stringify(stack, null, 2)
    : JSON.stringify(stack);

  const validationInfo = validation
    ? JSON.stringify(validation, null, 2)
    : "No validation results available.";

  const findingsInfo = Array.isArray(findings) && findings.length > 0
    ? JSON.stringify(
        findings.map((f) => ({
          id: f.id,
          ruleId: f.ruleId,
          category: f.category,
          severity: f.severity,
          title: f.title,
          file: f.file || f.affectedFile,
          startLine: f.startLine,
          endLine: f.endLine,
          evidence: f.evidence,
          explanation: f.explanation,
          risk: f.risk,
          recommendedFix: f.recommendedFix,
        })),
        null,
        2,
      )
    : "No findings reported.";

  const metricsInfo = Object.keys(metrics || {}).length > 0
    ? JSON.stringify(metrics, null, 2)
    : "No metrics reported.";

  return `Please evaluate the following repository evidence and generate the release assessment JSON:

=== REPOSITORY ===
${repositoryInfo}

=== DETECTED STACK ===
${stackInfo}

=== VALIDATION EVIDENCE ===
${validationInfo}

=== FINDINGS (${Array.isArray(findings) ? findings.length : 0}) ===
${findingsInfo}

=== METRICS ===
${metricsInfo}

Respond with only the structured JSON assessment object.`;
}

export function buildReleaseAssessmentMessages(input) {
  return [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: buildUserPrompt(input) },
  ];
}
