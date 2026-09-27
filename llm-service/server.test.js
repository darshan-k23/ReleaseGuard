import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createLlmApp } from "./server.js";
import { buildSystemPrompt, buildUserPrompt, buildReleaseAssessmentMessages } from "./prompts/releaseAssessment.js";
import { normalizeReleaseAssessment } from "./schemas/releaseAssessment.js";
import { OllamaProvider } from "./providers/ollama.js";

async function listenForTest(t, app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("system prompt explicitly contains all mandatory safety guidelines", () => {
  const prompt = buildSystemPrompt();
  assert.ok(prompt.includes("Only reason from the supplied repository evidence."));
  assert.ok(prompt.includes("Do not claim a build passed unless the validation object says PASS."));
  assert.ok(prompt.includes("Do not claim vulnerabilities unless supplied evidence supports them."));
  assert.ok(prompt.includes("Separate observed facts from recommendations."));
  assert.ok(prompt.includes("Do not output executable shell commands unless they appear in the supplied validation candidates."));
  assert.ok(prompt.includes("The model must NEVER invent a finding."));
});

test("user prompt formats repository evidence, findings, validation, and metrics", () => {
  const prompt = buildUserPrompt({
    repository: "owner/repo",
    stack: [{ ecosystem: "node", confidence: 1 }],
    validation: { status: "PASS", testsRun: 5 },
    findings: [
      {
        id: "SEC-01",
        ruleId: "SEC-HARDCODED-CREDENTIAL",
        category: "Security",
        severity: "HIGH",
        title: "Secret in code",
        file: "config.js",
        startLine: 10,
        endLine: 10,
        evidence: "key=123",
        explanation: "secret exposed",
        risk: "high risk",
        recommendedFix: "use env var",
      },
    ],
    metrics: { issuesFound: 1 },
  });

  assert.ok(prompt.includes("owner/repo"));
  assert.ok(prompt.includes("SEC-HARDCODED-CREDENTIAL"));
  assert.ok(prompt.includes("config.js"));
  assert.ok(prompt.includes("key=123"));
});

test("schema normalizer ensures all 7 required assessment properties are present", () => {
  const valid = {
    summary: "Release is blocked due to 1 high severity credential finding.",
    rootCauses: ["Un-externalized credentials in source code"],
    riskAssessment: {
      level: "HIGH",
      rationale: "Committed secrets can lead to unauthorized access.",
    },
    recommendedFixes: [
      {
        title: "Externalize credentials",
        ruleId: "SEC-HARDCODED-CREDENTIAL",
        targetFile: "config.js",
        fix: "Replace key=123 with process.env.API_KEY",
      },
    ],
    validationPlan: [
      {
        step: "Rerun test suite",
        command: "npm test",
        expectedOutcome: "All tests pass",
      },
    ],
    confidence: 0.95,
    limitations: ["Static analysis cannot verify runtime external secret manager"],
  };

  const normalized = normalizeReleaseAssessment(valid);
  assert.equal(normalized.summary, valid.summary);
  assert.deepEqual(normalized.rootCauses, valid.rootCauses);
  assert.equal(normalized.riskAssessment.level, "HIGH");
  assert.equal(normalized.recommendedFixes.length, 1);
  assert.equal(normalized.validationPlan.length, 1);
  assert.equal(normalized.confidence, 0.95);
  assert.deepEqual(normalized.limitations, valid.limitations);
});

test("GET /health responds with service metadata and provider status", async (t) => {
  const mockProvider = {
    checkHealth: async () => ({ status: "ok", version: "0.1.28" }),
  };
  const app = createLlmApp({ provider: mockProvider, modelName: "gpt-oss:20b", providerName: "ollama" });
  const baseUrl = await listenForTest(t, app);

  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "ok");
  assert.equal(data.provider, "ollama");
  assert.equal(data.model, "gpt-oss:20b");
  assert.equal(data.providerHealth.status, "ok");
});

test("POST /v1/release-assessment returns structured assessment when Ollama responds", async (t) => {
  const mockAssessment = {
    summary: "Release is ready for review with all checks passing.",
    rootCauses: [],
    riskAssessment: {
      level: "LOW",
      rationale: "All static checks and validation passed.",
    },
    recommendedFixes: [],
    validationPlan: [{ step: "Deploy to staging", command: "npm run deploy", expectedOutcome: "Success" }],
    confidence: 0.98,
    limitations: ["End-to-end smoke tests recommended."],
  };

  let capturedMessages = null;
  const mockProvider = {
    checkHealth: async () => ({ status: "ok" }),
    chat: async ({ messages }) => {
      capturedMessages = messages;
      return mockAssessment;
    },
  };

  const app = createLlmApp({ provider: mockProvider });
  const baseUrl = await listenForTest(t, app);

  const payload = {
    repository: "my-org/my-repo",
    stack: [{ ecosystem: "node" }],
    validation: { status: "PASS" },
    findings: [],
    metrics: { issuesFound: 0 },
  };

  const res = await fetch(`${baseUrl}/v1/release-assessment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.summary, mockAssessment.summary);
  assert.equal(body.riskAssessment.level, "LOW");
  assert.equal(body.confidence, 0.98);
  assert.ok(capturedMessages);
  assert.equal(capturedMessages[0].role, "system");
  assert.equal(capturedMessages[1].role, "user");
});

test("POST /v1/release-assessment returns structured 503 error when Ollama is unavailable", async (t) => {
  const mockProvider = {
    checkHealth: async () => ({ status: "unavailable" }),
    chat: async () => {
      const err = new Error("Failed to connect to Ollama service at http://localhost:11434: ECONNREFUSED");
      err.code = "PROVIDER_UNAVAILABLE";
      err.status = 503;
      err.details = "connect ECONNREFUSED 127.0.0.1:11434";
      throw err;
    },
  };

  const app = createLlmApp({ provider: mockProvider });
  const baseUrl = await listenForTest(t, app);

  const res = await fetch(`${baseUrl}/v1/release-assessment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repository: "test" }),
  });

  assert.equal(res.status, 503);
  const body = await res.json();
  assert.ok(body.error);
  assert.equal(body.error.code, "PROVIDER_UNAVAILABLE");
  assert.ok(body.error.message.includes("Failed to connect to Ollama service"));
  assert.ok(body.error.details.includes("ECONNREFUSED"));
});

test("remediation plan schema normalizer ensures required properties are present", async () => {
  const { normalizeRemediationPlan } = await import("./schemas/remediationPlan.js");
  const raw = {
    findingId: "SEC-01",
    diagnosis: "Committed literal secret in application.properties",
    plan: ["Remove literal", "Use environment variable"],
    filesToChange: ["application.properties"],
    proposedChanges: [
      {
        file: "application.properties",
        description: "Replace secret with ${DB_PASSWORD}",
        patch: "- password=123\n+ password=${DB_PASSWORD}",
      },
    ],
    validationPlan: [{ step: "Run tests", command: "mvn test", expectedOutcome: "Pass" }],
  };

  const normalized = normalizeRemediationPlan(raw);
  assert.equal(normalized.findingId, "SEC-01");
  assert.equal(normalized.diagnosis, raw.diagnosis);
  assert.deepEqual(normalized.plan, raw.plan);
  assert.deepEqual(normalized.filesToChange, ["application.properties"]);
  assert.equal(normalized.proposedChanges.length, 1);
  assert.equal(normalized.validationPlan.length, 1);
});

test("POST /v1/remediation-plan returns structured remediation plan", async (t) => {
  const mockPlan = {
    findingId: "SEC-01",
    diagnosis: "Hardcoded password",
    plan: ["Replace with env var"],
    filesToChange: ["config.properties"],
    proposedChanges: [{ file: "config.properties", description: "Use env var", patch: "diff" }],
    validationPlan: [{ step: "Verify", expectedOutcome: "Pass" }],
  };

  const mockProvider = {
    checkHealth: async () => ({ status: "ok" }),
    chat: async () => mockPlan,
  };

  const app = createLlmApp({ provider: mockProvider });
  const baseUrl = await listenForTest(t, app);

  const res = await fetch(`${baseUrl}/v1/remediation-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      finding: { id: "SEC-01", ruleId: "SEC-HARDCODED-CREDENTIAL", file: "config.properties" },
      repository: "repo",
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.findingId, "SEC-01");
  assert.equal(data.diagnosis, mockPlan.diagnosis);
  assert.deepEqual(data.filesToChange, ["config.properties"]);
});

