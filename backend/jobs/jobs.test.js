import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createApp } from "../server.js";
import { JobStore, JOB_STATUS, JOB_SOURCE, createRepositoryJob } from "./index.js";
import {
  validateGitHubUrl,
  createWorkspace,
  removeWorkspace,
  resolveWorkspacePath,
  getSafeFileTree,
  sanitizeErrorOutput,
} from "../repositories/index.js";

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

test("createRepositoryJob contains all required attributes with default values", () => {
  const job = createRepositoryJob({
    repositoryUrl: "https://github.com/octocat/Hello-World",
  });

  assert.equal(typeof job.jobId, "string");
  assert.ok(job.jobId.length > 0);
  assert.equal(job.status, JOB_STATUS.CREATED);
  assert.equal(job.source, JOB_SOURCE.GITHUB);
  assert.equal(job.repositoryUrl, "https://github.com/octocat/Hello-World");
  assert.equal(job.branch, null);
  assert.equal(job.commitSha, null);
  assert.equal(job.workspacePath, null);
  assert.equal(typeof job.createdAt, "string");
  assert.equal(job.startedAt, null);
  assert.equal(job.completedAt, null);
  assert.equal(job.error, null);
  assert.equal(job.validation, null);

  const keys = Object.keys(job);
  assert.deepEqual(keys.sort(), [
    "branch",
    "commitSha",
    "completedAt",
    "createdAt",
    "error",
    "jobId",
    "repositoryName",
    "repositoryUrl",
    "source",
    "startedAt",
    "status",
    "validation",
    "workspacePath",
  ].sort());
});

test("JobStore manages in-memory repository jobs correctly", () => {
  const store = new JobStore();
  const created = store.create({
    repositoryUrl: "https://github.com/owner/repo",
    branch: "main",
  });

  assert.equal(created.repositoryUrl, "https://github.com/owner/repo");
  assert.equal(created.branch, "main");

  const retrieved = store.get(created.jobId);
  assert.deepEqual(retrieved, created);

  const updated = store.update(created.jobId, { status: JOB_STATUS.RUNNING });
  assert.equal(updated.status, JOB_STATUS.RUNNING);
  assert.equal(store.get(created.jobId).status, JOB_STATUS.RUNNING);

  assert.equal(store.list().length, 1);
  assert.equal(store.delete(created.jobId), true);
  assert.equal(store.list().length, 0);
  assert.equal(store.get(created.jobId), null);
});

test("validateGitHubUrl accepts valid public GitHub repository URLs", () => {
  const validCases = [
    {
      input: "https://github.com/facebook/react",
      expectedOwner: "facebook",
      expectedRepo: "react",
      expectedUrl: "https://github.com/facebook/react",
    },
    {
      input: "https://github.com/vuejs/core.git",
      expectedOwner: "vuejs",
      expectedRepo: "core",
      expectedUrl: "https://github.com/vuejs/core",
    },
    {
      input: "https://github.com/owner-with-dashes/repo_with.dots-and-underscores/",
      expectedOwner: "owner-with-dashes",
      expectedRepo: "repo_with.dots-and-underscores",
      expectedUrl: "https://github.com/owner-with-dashes/repo_with.dots-and-underscores",
    },
  ];

  for (const tc of validCases) {
    const result = validateGitHubUrl(tc.input);
    assert.equal(result.owner, tc.expectedOwner);
    assert.equal(result.repo, tc.expectedRepo);
    assert.equal(result.normalizedUrl, tc.expectedUrl);
  }
});

test("validateGitHubUrl rejects arbitrary filesystem paths", () => {
  const filePaths = [
    "/etc/passwd",
    "\\Windows\\System32",
    "C:\\projects\\my-repo",
    "c:/projects/my-repo",
    "file:///home/user/repo",
    "../relative/path",
    "./local-repo",
  ];

  for (const fp of filePaths) {
    assert.throws(
      () => validateGitHubUrl(fp),
      (err) => err.code === "INVALID_REPOSITORY_URL",
    );
  }
});

test("validateGitHubUrl rejects non-GitHub URLs", () => {
  const nonGithubUrls = [
    "https://gitlab.com/owner/repo",
    "https://bitbucket.org/owner/repo",
    "https://evil.com/owner/repo",
    "http://github.com/owner/repo",
    "ftp://github.com/owner/repo",
  ];

  for (const url of nonGithubUrls) {
    assert.throws(
      () => validateGitHubUrl(url),
      (err) => err.code === "UNSUPPORTED_REPOSITORY_SOURCE" || err.code === "INVALID_REPOSITORY_URL",
    );
  }
});

test("validateGitHubUrl rejects private repository credentials", () => {
  const privateUrls = [
    "https://token@github.com/owner/repo",
    "https://user:pass@github.com/owner/repo",
  ];

  for (const url of privateUrls) {
    assert.throws(
      () => validateGitHubUrl(url),
      (err) => err.code === "PRIVATE_REPOSITORIES_NOT_SUPPORTED",
    );
  }
});

test("validateGitHubUrl rejects malformed URLs", () => {
  const malformed = [
    "",
    "   ",
    null,
    undefined,
    12345,
    "not a valid url",
    "https://github.com",
    "https://github.com/",
    "https://github.com/owner",
    "https://github.com/owner/",
    "https://github.com/owner/repo/extra/path",
    "https://github.com/owner/repo?token=secret",
    "https://github.com/owner/repo#readme",
    "https://github.com/owner/..",
    "https://github.com/owner/repo;touch malicious",
  ];

  for (const val of malformed) {
    assert.throws(
      () => validateGitHubUrl(val),
      (err) => err.code === "INVALID_REPOSITORY_URL",
    );
  }
});

test("POST /api/jobs clones repository and transitions through CREATED, CLONING, CLONED", async (t) => {
  const jobStore = new JobStore();
  const mockClone = async ({ workspacePath }) => {
    // Simulate git clone by creating a sample file
    await writeFile(path.join(workspacePath, "README.md"), "# Mock Repo");
    return {
      branch: "main",
      commitSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    };
  };

  const app = createApp({ jobStore, cloneRepo: mockClone });
  const baseUrl = await listenForTest(t, app);

  const response = await fetch(`${baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repositoryUrl: "https://github.com/octocat/Hello-World",
    }),
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.status, "CLONED");
  assert.equal(typeof body.jobId, "string");

  // Retrieve via GET /api/jobs/:jobId
  const getResponse = await fetch(`${baseUrl}/api/jobs/${body.jobId}`);
  assert.equal(getResponse.status, 200);
  const fetchedJob = await getResponse.json();

  assert.equal(fetchedJob.jobId, body.jobId);
  assert.equal(fetchedJob.status, "CLONED");
  assert.equal(fetchedJob.source, "github");
  assert.equal(fetchedJob.repositoryUrl, "https://github.com/octocat/Hello-World");
  assert.equal(fetchedJob.repositoryName, "Hello-World");
  assert.equal(fetchedJob.branch, "main");
  assert.equal(fetchedJob.commitSha, "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2");
  assert.ok(fetchedJob.workspacePath.includes(body.jobId));
  assert.equal(typeof fetchedJob.createdAt, "string");
  assert.equal(typeof fetchedJob.startedAt, "string");
  assert.equal(typeof fetchedJob.completedAt, "string");
  assert.equal(fetchedJob.error, null);

  // Clean up
  await fetch(`${baseUrl}/api/jobs/${body.jobId}`, { method: "DELETE" });
});

test("POST /api/jobs handles clone failure and updates status to FAILED", async (t) => {
  const jobStore = new JobStore();
  const mockFailingClone = async () => {
    throw new Error("fatal: repository 'https://github.com/secret/repo' not found");
  };

  const app = createApp({ jobStore, cloneRepo: mockFailingClone });
  const baseUrl = await listenForTest(t, app);

  const response = await fetch(`${baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repositoryUrl: "https://github.com/secret/repo",
    }),
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.status, "FAILED");
  assert.ok(body.error.includes("not found"));

  const getResponse = await fetch(`${baseUrl}/api/jobs/${body.jobId}`);
  assert.equal(getResponse.status, 200);
  const fetched = await getResponse.json();
  assert.equal(fetched.status, "FAILED");
  assert.ok(fetched.error.includes("not found"));
});

test("DELETE /api/jobs/:jobId removes workspace and job record", async (t) => {
  const jobStore = new JobStore();
  const jobId = "test-cleanup-job-123";
  const workspacePath = await createWorkspace(jobId);
  await writeFile(path.join(workspacePath, "file.txt"), "hello");

  jobStore.create({
    jobId,
    repositoryUrl: "https://github.com/owner/repo",
    status: JOB_STATUS.CLONED,
    workspacePath,
  });

  const app = createApp({ jobStore });
  const baseUrl = await listenForTest(t, app);

  const delResponse = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
    method: "DELETE",
  });
  assert.equal(delResponse.status, 200);
  const delBody = await delResponse.json();
  assert.equal(delBody.deleted, true);

  // Ensure job was removed from store
  const getJobRes = await fetch(`${baseUrl}/api/jobs/${jobId}`);
  assert.equal(getJobRes.status, 404);

  // Ensure workspace directory was deleted on disk
  await assert.rejects(async () => {
    await access(workspacePath);
  });
});

test("GET /api/jobs/:jobId/files returns safe file tree and never exposes sensitive files", async (t) => {
  const jobStore = new JobStore();
  const jobId = "test-safe-files-job";
  const workspacePath = await createWorkspace(jobId);

  // Create allowed files and directories
  await mkdir(path.join(workspacePath, "src"), { recursive: true });
  await writeFile(path.join(workspacePath, "src", "App.jsx"), "export default function App() {}");
  await writeFile(path.join(workspacePath, "README.md"), "# Welcome");
  await writeFile(path.join(workspacePath, "package.json"), '{"name": "test"}');

  // Create files that MUST be excluded
  // 1. .git internals
  await mkdir(path.join(workspacePath, ".git", "objects"), { recursive: true });
  await writeFile(path.join(workspacePath, ".git", "config"), "[core]");
  // 2. node_modules
  await mkdir(path.join(workspacePath, "node_modules", "pkg"), { recursive: true });
  await writeFile(path.join(workspacePath, "node_modules", "pkg", "index.js"), "module.exports = {};");
  // 3. target
  await mkdir(path.join(workspacePath, "target", "classes"), { recursive: true });
  await writeFile(path.join(workspacePath, "target", "app.jar"), "bytecode");
  // 4. dist
  await mkdir(path.join(workspacePath, "dist"), { recursive: true });
  await writeFile(path.join(workspacePath, "dist", "bundle.js"), "bundle");
  // 5. .env
  await writeFile(path.join(workspacePath, ".env"), "SECRET=123");
  // 6. .env.*
  await writeFile(path.join(workspacePath, ".env.production"), "API_KEY=xyz");
  await writeFile(path.join(workspacePath, ".env.local"), "LOCAL=true");
  // 7. Private key files
  await writeFile(path.join(workspacePath, "server.pem"), "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----");
  await writeFile(path.join(workspacePath, "id_rsa"), "private key material");
  await writeFile(path.join(workspacePath, "app.key"), "key");

  jobStore.create({
    jobId,
    repositoryUrl: "https://github.com/owner/repo",
    repositoryName: "repo",
    status: JOB_STATUS.CLONED,
    workspacePath,
  });

  const app = createApp({ jobStore });
  const baseUrl = await listenForTest(t, app);

  const res = await fetch(`${baseUrl}/api/jobs/${jobId}/files`);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.jobId, jobId);
  assert.equal(data.repositoryName, "repo");
  assert.ok(Array.isArray(data.files));
  assert.ok(Array.isArray(data.tree));

  // Verify allowed files are present
  assert.ok(data.files.includes("README.md"));
  assert.ok(data.files.includes("package.json"));
  assert.ok(data.files.includes("src/App.jsx"));

  // Verify excluded items are NEVER exposed
  for (const f of data.files) {
    assert.ok(!f.startsWith(".git"), `.git exposed: ${f}`);
    assert.ok(!f.includes("node_modules"), `node_modules exposed: ${f}`);
    assert.ok(!f.startsWith("target"), `target exposed: ${f}`);
    assert.ok(!f.startsWith("dist"), `dist exposed: ${f}`);
    assert.ok(!f.startsWith(".env"), `.env exposed: ${f}`);
    assert.ok(!f.endsWith(".pem"), `.pem exposed: ${f}`);
    assert.ok(!f.endsWith(".key"), `.key exposed: ${f}`);
    assert.ok(!f.includes("id_rsa"), `id_rsa exposed: ${f}`);
  }

  // Verify total allowed count is exactly 3 (README.md, package.json, src/App.jsx)
  assert.equal(data.files.length, 3);
  assert.equal(data.fileCount, 3);

  // Clean up
  await removeWorkspace(jobId);
});

test("GET /api/jobs/:jobId/files returns 409 if job is not CLONED", async (t) => {
  const jobStore = new JobStore();
  const job = jobStore.create({
    repositoryUrl: "https://github.com/owner/repo",
    status: JOB_STATUS.CLONING,
  });

  const app = createApp({ jobStore });
  const baseUrl = await listenForTest(t, app);

  const res = await fetch(`${baseUrl}/api/jobs/${job.jobId}/files`);
  assert.equal(res.status, 409);
  assertStructuredError(await res.json(), "JOB_NOT_READY");
});

test("POST /api/jobs/:jobId/validate returns 404 for an unknown job", async (t) => {
  const jobStore = new JobStore();
  const app = createApp({ jobStore });
  const baseUrl = await listenForTest(t, app);

  const res = await fetch(`${baseUrl}/api/jobs/does-not-exist/validate`, { method: "POST" });
  assert.equal(res.status, 404);
  assertStructuredError(await res.json(), "JOB_NOT_FOUND");
});

test("POST /api/jobs/:jobId/validate returns 409 if job is not CLONED", async (t) => {
  const jobStore = new JobStore();
  const job = jobStore.create({
    repositoryUrl: "https://github.com/owner/repo",
    status: JOB_STATUS.CLONING,
  });

  const app = createApp({ jobStore });
  const baseUrl = await listenForTest(t, app);

  const res = await fetch(`${baseUrl}/api/jobs/${job.jobId}/validate`, { method: "POST" });
  assert.equal(res.status, 409);
  assertStructuredError(await res.json(), "JOB_NOT_READY");
});

test("POST /api/jobs/:jobId/validate returns 400 if the job's clone already failed", async (t) => {
  const jobStore = new JobStore();
  const job = jobStore.create({
    repositoryUrl: "https://github.com/owner/repo",
    status: JOB_STATUS.FAILED,
    error: "fatal: repository not found",
  });

  const app = createApp({ jobStore });
  const baseUrl = await listenForTest(t, app);

  const res = await fetch(`${baseUrl}/api/jobs/${job.jobId}/validate`, { method: "POST" });
  assert.equal(res.status, 400);
  assertStructuredError(await res.json(), "JOB_FAILED");
});

test("POST /api/jobs/:jobId/validate detects the stack, runs validation, stores it on the job, and returns structured evidence", async (t) => {
  const jobStore = new JobStore();
  const jobId = "test-validate-job";
  const workspacePath = await createWorkspace(jobId);
  await writeFile(path.join(workspacePath, "package.json"), '{"name": "test", "scripts": {"test": "echo ok"}}');

  jobStore.create({
    jobId,
    repositoryUrl: "https://github.com/owner/repo",
    status: JOB_STATUS.CLONED,
    workspacePath,
  });

  const detectedEcosystems = [
    { ecosystem: "Node", manifest: "package.json", status: "EXECUTABLE", buildCandidates: [], testCandidates: ["npm test"] },
  ];
  const validationResult = {
    workspacePath,
    status: "PASS",
    passed: true,
    summary: { total: 2, passed: 2, failed: 0, notRun: 0, timeouts: 0, toolUnavailable: 0 },
    executions: [
      {
        command: "npm install --no-audit --no-fund",
        workingDirectory: ".",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 5,
        exitCode: 0,
        status: "PASS",
        stdout: "",
        stderr: "",
      },
      {
        command: "npm test",
        workingDirectory: ".",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 5,
        exitCode: 0,
        status: "PASS",
        stdout: "ok",
        stderr: "",
      },
    ],
  };

  let detectCalledWith = null;
  let validateCalledWith = null;
  const app = createApp({
    jobStore,
    detectRepoStack: async (wsPath) => {
      detectCalledWith = wsPath;
      return detectedEcosystems;
    },
    runValidate: async (args) => {
      validateCalledWith = args;
      return validationResult;
    },
  });
  const baseUrl = await listenForTest(t, app);

  const res = await fetch(`${baseUrl}/api/jobs/${jobId}/validate`, { method: "POST" });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.jobId, jobId);
  assert.equal(body.status, "COMPLETED");
  assert.deepEqual(body.stack, detectedEcosystems);
  assert.deepEqual(body.validation, validationResult);

  assert.equal(detectCalledWith, workspacePath);
  assert.equal(validateCalledWith.workspacePath, workspacePath);
  assert.deepEqual(validateCalledWith.ecosystems, detectedEcosystems);

  // Results are stored in memory on the job itself.
  const getRes = await fetch(`${baseUrl}/api/jobs/${jobId}`);
  const storedJob = await getRes.json();
  assert.equal(storedJob.status, "COMPLETED");
  assert.deepEqual(storedJob.validation, validationResult);

  await removeWorkspace(jobId);
});

test("POST /api/jobs/:jobId/validate marks the job FAILED (not a fabricated PASS) if validation itself throws", async (t) => {
  const jobStore = new JobStore();
  const jobId = "test-validate-throws-job";
  const workspacePath = await createWorkspace(jobId);
  await writeFile(path.join(workspacePath, "package.json"), '{"name": "test"}');

  jobStore.create({
    jobId,
    repositoryUrl: "https://github.com/owner/repo",
    status: JOB_STATUS.CLONED,
    workspacePath,
  });

  const app = createApp({
    jobStore,
    detectRepoStack: async () => {
      throw new Error("permission denied while scanning workspace");
    },
  });
  const baseUrl = await listenForTest(t, app);

  const res = await fetch(`${baseUrl}/api/jobs/${jobId}/validate`, { method: "POST" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.jobId, jobId);
  assert.equal(body.status, "FAILED");
  assert.ok(body.error.includes("permission denied"));

  const getRes = await fetch(`${baseUrl}/api/jobs/${jobId}`);
  const storedJob = await getRes.json();
  assert.equal(storedJob.status, "FAILED");
  assert.equal(storedJob.validation, null);

  await removeWorkspace(jobId);
});

test("Workspace path resolver prevents path traversal and workspace escape", () => {
  assert.throws(
    () => resolveWorkspacePath("../outside"),
    (err) => err.code === "INVALID_JOB_ID",
  );
  assert.throws(
    () => resolveWorkspacePath("job/../../escape"),
    (err) => err.code === "INVALID_JOB_ID",
  );
  assert.throws(
    () => resolveWorkspacePath(""),
    (err) => err.code === "INVALID_JOB_ID",
  );
});

test("sanitizeErrorOutput redacts credentials and tokens", () => {
  const raw = "Error: password=supersecret at token=ghp_1234567890abcdef with bearer abc.xyz.123";
  const sanitized = sanitizeErrorOutput(raw);
  assert.ok(!sanitized.includes("supersecret"));
  assert.ok(!sanitized.includes("ghp_1234567890abcdef"));
  assert.ok(!sanitized.includes("abc.xyz.123"));
  assert.ok(sanitized.includes("[REDACTED]"));
});
