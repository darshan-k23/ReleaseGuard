import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "./server.js";

async function listenForTest(t, app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

function assertStructuredError(body, code) {
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, "string");
  assert.equal(typeof body.error.details, "string");
}

test("API health endpoint responds with a structured healthy status", async (t) => {
  const app = createApp();
  const baseUrl = await listenForTest(t, app);
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("API analyze endpoint runs once and exposes only the latest in-memory result", async (t) => {
  const analysis = {
    analysisId: "api-analysis-1",
    project: { name: "ShopSphere" },
    findings: [],
    releasePlan: [],
    score: 100,
  };
  let calls = 0;
  let argumentCount = null;
  const app = createApp({
    analyze: async (...args) => {
      calls += 1;
      argumentCount = args.length;
      return analysis;
    },
    getProject: async () => ({ name: "ShopSphere" }),
  });
  const baseUrl = await listenForTest(t, app);
  const response = await fetch(`${baseUrl}/api/analyze?path=../../outside`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectRoot: "C:/private", command: "whoami" }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), analysis);
  assert.equal(calls, 1);
  assert.equal(argumentCount, 0);

  const latest = await fetch(`${baseUrl}/api/analysis/latest`);
  assert.equal(latest.status, 200);
  assert.deepEqual(await latest.json(), analysis);
});

test("analysis endpoints return structured not-found errors before the first run", async (t) => {
  const baseUrl = await listenForTest(t, createApp());
  const response = await fetch(`${baseUrl}/api/analysis/latest`);
  assert.equal(response.status, 404);
  assertStructuredError(await response.json(), "ANALYSIS_NOT_FOUND");
});

test("malformed JSON returns a structured client error", async (t) => {
  const baseUrl = await listenForTest(t, createApp());
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{broken",
  });
  assert.equal(response.status, 400);
  assertStructuredError(await response.json(), "INVALID_JSON");
});

test("unexpected analysis errors are structured and do not leak error or secret text", async (t) => {
  const app = createApp({
    analyze: async () => { throw new Error("password=secret-value must-not-leak"); },
  });
  const baseUrl = await listenForTest(t, app);
  const logs = [];
  const originalError = console.error;
  console.error = (...values) => logs.push(values.join(" "));
  let response;
  let body;
  try {
    response = await fetch(`${baseUrl}/api/analyze`, { method: "POST" });
    body = await response.json();
  } finally {
    console.error = originalError;
  }
  assert.equal(response.status, 500);
  assertStructuredError(body, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(body).includes("secret-value"), false);
  assert.equal(logs.some((line) => line.includes("secret-value")), false);
  assert.deepEqual(logs, ["ReleaseGuard API error: INTERNAL_ERROR"]);
});

test("POST /api/release-assessment forwards evidence to llm-service", async (t) => {
  const mockAssessment = {
    summary: "Release ready",
    rootCauses: [],
    riskAssessment: { level: "LOW", rationale: "All checks passed" },
    recommendedFixes: [],
    validationPlan: [],
    confidence: 1,
    limitations: [],
  };

  let forwardedPayload = null;
  const app = createApp({
    fetchAssessment: async (payload) => {
      forwardedPayload = payload;
      return mockAssessment;
    },
  });
  const baseUrl = await listenForTest(t, app);

  const res = await fetch(`${baseUrl}/api/release-assessment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repository: "my-repo", stack: ["Node"] }),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), mockAssessment);
  assert.equal(forwardedPayload.repository, "my-repo");
});

test("POST /api/jobs/:jobId/assessment calls LLM assessment with job evidence", async (t) => {
  const { JobStore, JOB_STATUS } = await import("./jobs/index.js");
  const jobStore = new JobStore();
  const jobId = "job-assessment-test";
  jobStore.create({
    jobId,
    repositoryUrl: "https://github.com/org/repo",
    repositoryName: "org/repo",
    status: JOB_STATUS.COMPLETED,
    validation: { status: "PASS" },
  });

  const mockAssessment = {
    summary: "Job assessment complete",
    rootCauses: [],
    riskAssessment: { level: "LOW", rationale: "Passed" },
    recommendedFixes: [],
    validationPlan: [],
    confidence: 0.99,
    limitations: [],
  };

  const app = createApp({
    jobStore,
    fetchAssessment: async (evidence) => {
      assert.equal(evidence.repository, "org/repo");
      assert.deepEqual(evidence.validation, { status: "PASS" });
      return mockAssessment;
    },
  });
  const baseUrl = await listenForTest(t, app);

  const res = await fetch(`${baseUrl}/api/jobs/${jobId}/assessment`, { method: "POST" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), mockAssessment);

  const updatedJob = jobStore.get(jobId);
  assert.deepEqual(updatedJob.assessment, mockAssessment);
});

test("unknown API routes return structured errors", async (t) => {
  const baseUrl = await listenForTest(t, createApp());
  const response = await fetch(`${baseUrl}/api/not-a-route`);
  assert.equal(response.status, 404);
  assertStructuredError(await response.json(), "ROUTE_NOT_FOUND");
});

