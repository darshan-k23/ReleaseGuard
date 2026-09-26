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

test("unknown API routes return structured errors", async (t) => {
  const baseUrl = await listenForTest(t, createApp());
  const response = await fetch(`${baseUrl}/api/not-a-route`);
  assert.equal(response.status, 404);
  assertStructuredError(await response.json(), "ROUTE_NOT_FOUND");
});
