import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalysisPrompt,
  buildFixPrompt,
  formatRepositoryLabel,
  getRepositoryIdentifier,
} from "./bobPrompts.js";

const demoRepositories = [
  "release-ready",
  "warning-only",
  "configuration-risk",
  "security-blocked",
  "test-failing",
  "critically-blocked",
];

test("getRepositoryIdentifier resolves repository identity across analysis data shapes", () => {
  assert.equal(
    getRepositoryIdentifier({ repository: { name: "security-blocked" } }),
    "security-blocked",
  );
  assert.equal(
    getRepositoryIdentifier({ project: { name: "warning-only" } }),
    "warning-only",
  );
  assert.equal(
    getRepositoryIdentifier({ job: { repositoryName: "facebook/react" } }),
    "facebook/react",
  );
  assert.equal(
    getRepositoryIdentifier({ project: { repository: "https://github.com/org/repo" } }),
    "https://github.com/org/repo",
  );
  assert.equal(getRepositoryIdentifier({}), "workspace");
});

test("formatRepositoryLabel formats repository names with trailing slash without duplication", () => {
  assert.equal(formatRepositoryLabel({ repository: { name: "security-blocked" } }), "security-blocked/");
  assert.equal(formatRepositoryLabel({ repository: { name: "security-blocked/" } }), "security-blocked/");
  assert.equal(formatRepositoryLabel({}), "workspace/");
});

for (const demoRepo of demoRepositories) {
  test(`generates dynamic analysis and fix prompts for demo repository: ${demoRepo}`, () => {
    const analysis = {
      analysisId: `analysis-${demoRepo}-123`,
      status: "RELEASE BLOCKED",
      repository: { name: demoRepo },
      findings: [
        {
          id: "finding-1",
          ruleId: "RULE-01",
          severity: "HIGH",
          category: "Security",
          status: "OPEN",
          title: "Sample High Finding",
          affectedFile: "src/index.js",
          startLine: 10,
          endLine: 12,
          evidence: "sample evidence",
          explanation: "sample explanation",
          risk: "blocks release",
          recommendedFix: "remove sensitive line",
        },
      ],
    };

    const finding = analysis.findings[0];
    const analysisPrompt = buildAnalysisPrompt(analysis, finding);
    const fixPrompt = buildFixPrompt(finding, analysis);

    // Ensure hardcoded demo-project/ is never present
    assert.ok(!analysisPrompt.includes("demo-project/"));
    assert.ok(!fixPrompt.includes("demo-project/"));

    // Ensure real repository identity is present
    assert.ok(analysisPrompt.includes(`Repository: ${demoRepo}/ (inspect this repository only)`));
    assert.ok(fixPrompt.includes(`Repository: ${demoRepo}/`));

    // Ensure analysis ID and status are included
    assert.ok(analysisPrompt.includes(`ReleaseGuard analysis ID: ${analysis.analysisId}`));
    assert.ok(analysisPrompt.includes(`Current release status: ${analysis.status}`));
    assert.ok(fixPrompt.includes(`Baseline analysis ID: ${analysis.analysisId}`));

    // Ensure finding details are dynamically populated
    assert.ok(analysisPrompt.includes("Rule: RULE-01"));
    assert.ok(analysisPrompt.includes("File: src/index.js:10-12"));
    assert.ok(analysisPrompt.includes("Evidence: sample evidence"));
    assert.ok(fixPrompt.includes("Finding: RULE-01 (HIGH, Security)"));
    assert.ok(fixPrompt.includes("File and line: src/index.js:10-12"));
    assert.ok(fixPrompt.includes("Recommended direction: remove sensitive line"));

    // Ensure required section headers and guardrails exist
    assert.ok(analysisPrompt.includes("Do not modify files until the developer approves the proposed change."));
    assert.ok(fixPrompt.includes("BEFORE\nCHANGE\nVALIDATION\nAFTER"));
    assert.ok(fixPrompt.includes("Never add real credentials or secrets."));
  });
}

test("generates prompts for arbitrary public GitHub repositories", () => {
  const analysis = {
    analysisId: "analysis-gh-999",
    status: "RELEASE BLOCKED",
    repository: { name: "octocat/Hello-World", url: "https://github.com/octocat/Hello-World" },
    findings: [
      {
        id: "finding-gh-1",
        ruleId: "SEC-HARDCODED-CREDENTIAL",
        severity: "CRITICAL",
        category: "Security",
        status: "OPEN",
        title: "Synthetic secret marker",
        affectedFile: "config/app.json",
        startLine: 5,
        endLine: 5,
        evidence: "api_key = demo_token",
        explanation: "Exposed API key in config",
        risk: "Credential leakage",
        recommendedFix: "Extract token to environment variable",
      },
    ],
  };

  const finding = analysis.findings[0];
  const analysisPrompt = buildAnalysisPrompt(analysis, finding);
  const fixPrompt = buildFixPrompt(finding, analysis);

  assert.ok(!analysisPrompt.includes("demo-project/"));
  assert.ok(!fixPrompt.includes("demo-project/"));
  assert.ok(analysisPrompt.includes("Repository: octocat/Hello-World/ (inspect this repository only)"));
  assert.ok(fixPrompt.includes("Repository: octocat/Hello-World/"));
});

test("handles null finding gracefully in prompt builders", () => {
  const analysis = {
    analysisId: "analysis-clean-1",
    status: "RELEASE READY",
    repository: { name: "release-ready" },
    findings: [],
  };

  const analysisPrompt = buildAnalysisPrompt(analysis, null);
  const fixPrompt = buildFixPrompt(null, analysis);

  assert.ok(analysisPrompt.includes("Repository: release-ready/ (inspect this repository only)"));
  assert.ok(analysisPrompt.includes("No individual finding is selected. Inspect the current blockers listed below."));
  assert.equal(fixPrompt, "Select a finding in ReleaseGuard before generating a Bob fix prompt.");
});
