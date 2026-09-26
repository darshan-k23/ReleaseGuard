import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detectStack, ECOSYSTEM_STATUS } from "./stackDetector.js";
import { createApp } from "../server.js";
import { JobStore, JOB_STATUS } from "../jobs/index.js";
import { createWorkspace, removeWorkspace } from "../repositories/index.js";

async function listenForTest(t, app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("detectStack identifies Node ecosystem with scripts and lockfiles", async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "rg-stack-node-"));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  await writeFile(
    path.join(tmpDir, "package.json"),
    JSON.stringify({
      name: "node-app",
      scripts: {
        build: "vite build",
        test: "vitest run",
      },
    }),
  );
  await writeFile(path.join(tmpDir, "package-lock.json"), "{}");

  const results = await detectStack(tmpDir);
  assert.equal(results.length, 1);
  const nodeEcosystem = results[0];

  assert.equal(nodeEcosystem.ecosystem, "Node");
  assert.equal(nodeEcosystem.manifest, "package.json");
  assert.equal(nodeEcosystem.packageManager, "npm");
  assert.equal(nodeEcosystem.status, ECOSYSTEM_STATUS.EXECUTABLE);
  assert.deepEqual(nodeEcosystem.buildCandidates, ["npm run build"]);
  assert.deepEqual(nodeEcosystem.testCandidates, ["npm test", "npm run test"]);
});

test("detectStack identifies Maven ecosystem with candidate commands", async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "rg-stack-maven-"));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  await writeFile(
    path.join(tmpDir, "pom.xml"),
    "<project><modelVersion>4.0.0</modelVersion></project>",
  );

  const results = await detectStack(tmpDir);
  assert.equal(results.length, 1);
  const mavenEcosystem = results[0];

  assert.equal(mavenEcosystem.ecosystem, "Maven");
  assert.equal(mavenEcosystem.manifest, "pom.xml");
  assert.equal(mavenEcosystem.packageManager, "mvn");
  assert.equal(mavenEcosystem.status, ECOSYSTEM_STATUS.EXECUTABLE);
  assert.deepEqual(mavenEcosystem.buildCandidates, ["mvn package -DskipTests"]);
  assert.deepEqual(mavenEcosystem.testCandidates, ["mvn test"]);
});

test("detectStack identifies Gradle ecosystem and marks it NOT_RUN", async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "rg-stack-gradle-"));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  await writeFile(path.join(tmpDir, "build.gradle.kts"), "plugins {}");

  const results = await detectStack(tmpDir);
  assert.equal(results.length, 1);
  const gradleEcosystem = results[0];

  assert.equal(gradleEcosystem.ecosystem, "Gradle");
  assert.equal(gradleEcosystem.manifest, "build.gradle.kts");
  assert.equal(gradleEcosystem.status, ECOSYSTEM_STATUS.NOT_RUN);
  assert.ok(gradleEcosystem.buildCandidates.length > 0);
  assert.ok(gradleEcosystem.testCandidates.length > 0);
});

test("detectStack identifies Python ecosystem and marks it NOT_RUN", async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "rg-stack-python-"));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  await writeFile(path.join(tmpDir, "requirements.txt"), "flask==3.0.0\npytest\n");

  const results = await detectStack(tmpDir);
  assert.equal(results.length, 1);
  const pyEcosystem = results[0];

  assert.equal(pyEcosystem.ecosystem, "Python");
  assert.equal(pyEcosystem.manifest, "requirements.txt");
  assert.equal(pyEcosystem.packageManager, "pip");
  assert.equal(pyEcosystem.status, ECOSYSTEM_STATUS.NOT_RUN);
  assert.deepEqual(pyEcosystem.testCandidates, ["pytest"]);
});

test("detectStack identifies Go and Rust ecosystems and marks them NOT_RUN", async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "rg-stack-gorus-"));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  await writeFile(path.join(tmpDir, "go.mod"), "module example.com/app\n\ngo 1.22\n");
  await writeFile(path.join(tmpDir, "Cargo.toml"), "[package]\nname = \"app\"\nversion = \"0.1.0\"\n");

  const results = await detectStack(tmpDir);
  assert.equal(results.length, 2);

  const goEcosystem = results.find((e) => e.ecosystem === "Go");
  assert.ok(goEcosystem);
  assert.equal(goEcosystem.manifest, "go.mod");
  assert.equal(goEcosystem.status, ECOSYSTEM_STATUS.NOT_RUN);

  const rustEcosystem = results.find((e) => e.ecosystem === "Rust");
  assert.ok(rustEcosystem);
  assert.equal(rustEcosystem.manifest, "Cargo.toml");
  assert.equal(rustEcosystem.status, ECOSYSTEM_STATUS.NOT_RUN);
});

test("detectStack ignores node_modules and .git manifests", async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "rg-stack-skip-"));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  await mkdir(path.join(tmpDir, "node_modules", "some-dep"), { recursive: true });
  await writeFile(path.join(tmpDir, "node_modules", "some-dep", "package.json"), "{}");

  await mkdir(path.join(tmpDir, ".git"), { recursive: true });
  await writeFile(path.join(tmpDir, ".git", "pom.xml"), "<fake/>");

  const results = await detectStack(tmpDir);
  assert.equal(results.length, 0);
});

test("detectStack detects multi-service repositories like ShopSphere", async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "rg-stack-shopsphere-"));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  await mkdir(path.join(tmpDir, "frontend"), { recursive: true });
  await writeFile(
    path.join(tmpDir, "frontend", "package.json"),
    JSON.stringify({
      name: "shopsphere-frontend",
      scripts: { build: "vite build" },
    }),
  );

  await mkdir(path.join(tmpDir, "backend"), { recursive: true });
  await writeFile(path.join(tmpDir, "backend", "pom.xml"), "<project/>");

  const results = await detectStack(tmpDir);
  assert.equal(results.length, 2);

  const nodeEco = results.find((r) => r.ecosystem === "Node");
  assert.ok(nodeEco);
  assert.equal(nodeEco.manifest, "frontend/package.json");
  assert.equal(nodeEco.status, ECOSYSTEM_STATUS.EXECUTABLE);
  assert.deepEqual(nodeEco.buildCandidates, ["npm run build"]);
  assert.deepEqual(nodeEco.testCandidates, []);

  const mavenEco = results.find((r) => r.ecosystem === "Maven");
  assert.ok(mavenEco);
  assert.equal(mavenEco.manifest, "backend/pom.xml");
  assert.equal(mavenEco.status, ECOSYSTEM_STATUS.EXECUTABLE);
});

test("GET /api/jobs/:jobId/stack returns detected stack for CLONED job", async (t) => {
  const jobStore = new JobStore();
  const jobId = "test-job-stack-1";
  const workspacePath = await createWorkspace(jobId);

  await writeFile(
    path.join(workspacePath, "package.json"),
    JSON.stringify({
      name: "sample-app",
      scripts: { build: "tsc", test: "node --test" },
    }),
  );

  jobStore.create({
    jobId,
    repositoryUrl: "https://github.com/owner/sample-app",
    status: JOB_STATUS.CLONED,
    workspacePath,
  });

  const app = createApp({ jobStore });
  const baseUrl = await listenForTest(t, app);

  const res = await fetch(`${baseUrl}/api/jobs/${jobId}/stack`);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.jobId, jobId);
  assert.ok(Array.isArray(data.ecosystems));
  assert.equal(data.ecosystems.length, 1);
  assert.equal(data.ecosystems[0].ecosystem, "Node");
  assert.equal(data.ecosystems[0].status, "EXECUTABLE");
  assert.deepEqual(data.ecosystems[0].buildCandidates, ["npm run build"]);
  assert.deepEqual(data.ecosystems[0].testCandidates, ["npm test", "npm run test"]);

  // Clean up
  await removeWorkspace(jobId);
});

test("GET /api/jobs/:jobId/stack returns 404 for unknown job and 409 if not CLONED", async (t) => {
  const jobStore = new JobStore();
  const pendingJob = jobStore.create({
    repositoryUrl: "https://github.com/owner/pending",
    status: JOB_STATUS.CLONING,
  });

  const app = createApp({ jobStore });
  const baseUrl = await listenForTest(t, app);

  const notFoundRes = await fetch(`${baseUrl}/api/jobs/missing-id/stack`);
  assert.equal(notFoundRes.status, 404);

  const notReadyRes = await fetch(`${baseUrl}/api/jobs/${pendingJob.jobId}/stack`);
  assert.equal(notReadyRes.status, 409);
});
