export function buildRemediationSystemPrompt() {
  return `You are ReleaseGuard's AI Remediation Engine.

Your task is to generate a narrowly scoped, source-backed remediation plan and patch candidate for a specific finding.

CRITICAL RULES:
1. Only reason from the supplied repository evidence.
2. The model must NEVER invent a finding.
3. Do not perform unrelated cleanup or refactoring; fix ONLY this finding.
4. Do not output real credentials or secrets under any circumstances. Use environment variables (e.g. \${DB_PASSWORD}, process.env.VAR) or placeholders.
5. Do not directly modify the repository. Represent proposed changes as patch candidates (code diffs or replacement snippets).
6. Separate observed facts from recommendations.
7. Do not output executable shell commands unless they appear in the supplied validation candidates.

You must output ONLY valid JSON matching this schema:
{
  "findingId": "Exact ID of the finding being remediated",
  "diagnosis": "Technical root-cause diagnosis of the issue in this file",
  "plan": [
    "Step 1: description",
    "Step 2: description"
  ],
  "filesToChange": ["path/to/file.ext"],
  "proposedChanges": [
    {
      "file": "path/to/file.ext",
      "description": "Explanation of the precise modification",
      "patch": "Unified diff or exact code replacement snippet"
    }
  ],
  "validationPlan": [
    {
      "step": "Step description",
      "command": "Allowlisted validation command if available in candidates",
      "expectedOutcome": "Expected passing outcome"
    }
  ]
}`;
}

export function buildRemediationUserPrompt({
  finding = {},
  repository = "workspace",
  stack = [],
  fileContent = "",
} = {}) {
  const findingInfo = JSON.stringify(
    {
      id: finding.id,
      ruleId: finding.ruleId,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      file: finding.file || finding.affectedFile,
      startLine: finding.startLine,
      endLine: finding.endLine,
      evidence: finding.evidence,
      explanation: finding.explanation,
      risk: finding.risk,
      recommendedFix: finding.recommendedFix,
    },
    null,
    2,
  );

  const stackInfo = Array.isArray(stack) ? JSON.stringify(stack, null, 2) : String(stack);

  const sourceSnippet = fileContent
    ? `\n=== FILE CONTENT (${finding.file || finding.affectedFile}) ===\n${fileContent}\n`
    : "";

  return `Generate a remediation plan for the following finding in repository "${repository}":

=== FINDING ===
${findingInfo}

=== STACK ===
${stackInfo}
${sourceSnippet}
Respond with only the structured JSON remediation plan object.`;
}

export function buildRemediationPlanMessages(input) {
  return [
    { role: "system", content: buildRemediationSystemPrompt() },
    { role: "user", content: buildRemediationUserPrompt(input) },
  ];
}
