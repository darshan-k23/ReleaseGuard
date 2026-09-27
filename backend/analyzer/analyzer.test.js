import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runSecurityRule } from "./rules/security.js";
import { runConfigurationRule } from "./rules/configuration.js";
import { runIntegrationRule } from "./rules/integration.js";
import { runDocumentationRule } from "./rules/documentation.js";
import { runDependenciesRule } from "./rules/dependencies.js";
import { runTestsRule } from "./rules/tests.js";
import { runBuildRule } from "./rules/build.js";
import { computeScore, deriveReleaseStatus } from "./scoring.js";
import { resolveProjectFile, walkProject } from "./utils/fileWalker.js";
import { createFinding } from "./utils/evidence.js";
import { CHECK_STATUS } from "./types.js";

function createContext(sourceEntries, options = {}) {
  const files = Object.entries(sourceEntries).map(([relativePath, text]) => ({
    relativePath,
    text,
    lines: text.split(/\r?\n/),
  }));
  return {
    files,
    byPath: new Map(files.map((file) => [file.relativePath, file])),
    projectRoot: options.projectRoot || os.tmpdir(),
    runCommand: options.runCommand || (async () => ({
      command: null,
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 1,
      timedOut: false,
    })),
  };
}

const backendPom = `
<project>
  <artifactId>shopsphere-backend</artifactId>
  <dependencies><dependency><artifactId>spring-boot-starter-test</artifactId></dependency></dependencies>
</project>`;
const testSource = `package com.example;
class AuthServiceTest {
  @Test
  void works() {}
}`;

 test("security flags literal credentials and DEBUG but ignores env and documented examples", () => {
  const context = createContext({
    "backend/src/main/resources/application.properties": [
      "spring.datasource.password=${DB_PASSWORD}",
      "spring.datasource.password=${SHOPSPHERE_DB_PASSWORD}",
      "spring.datasource.password=abc",
      "spring.datasource.password=changeme",
      "api_key=example-value",
      "shopsphere.demo.password=demo-only-not-a-secret",
      "auth.token=abc123456789",
      "logging.level.root=DEBUG",
      "# synthetic example secret=realLooking987",
    ].join("\n"),
    "backend/src/test/java/com/example/AuthServiceTest.java":
      'String token = authService.issueToken("demo-user");',
  });
  const result = runSecurityRule(context);
  assert.deepEqual(result.findings.map((finding) => finding.ruleId), [
    "SEC-HARDCODED-CREDENTIAL",
    "SEC-HARDCODED-CREDENTIAL",
    "SEC-HARDCODED-CREDENTIAL",
    "SEC-DEBUG-LOGGING",
  ]);
  assert.equal(result.findings[0].evidence, "spring.datasource.password=abc");
  assert.equal(result.findings[1].evidence, "shopsphere.demo.password=demo-only-not-a-secret");
  assert.equal(result.findings[1].severity, "HIGH");
  assert.equal(result.findings[2].evidence, "auth.token=abc123456789");
});

test("configuration finds missing profiles, fixed datasource hosts, and unsafe schema updates", () => {
  const context = createContext({
    "backend/src/main/resources/application.properties": [
      "server.port=8080",
      "spring.datasource.url=jdbc:mysql://db.example.internal:3306/shop",
      "spring.datasource.password=${DB_PASSWORD}",
      "spring.jpa.hibernate.ddl-auto=update",
    ].join("\n"),
  });
  const result = runConfigurationRule(context);
  assert.deepEqual(new Set(result.findings.map((finding) => finding.ruleId)), new Set([
    "CFG-MISSING-PRODUCTION-PROFILE",
    "CFG-NONEXTERNALIZED-DATASOURCE",
    "CFG-DEVELOPMENT-DDL-DEFAULT",
  ]));
  assert.equal(result.findings.find((finding) => finding.ruleId === "CFG-NONEXTERNALIZED-DATASOURCE").startLine, 2);
});

test("configuration accepts an explicit production profile", () => {
  const context = createContext({
    "backend/src/main/resources/application.properties": "server.port=8080",
    "backend/src/main/resources/application-prod.properties": "server.port=${SERVER_PORT}",
  });
  const result = runConfigurationRule(context);
  assert.equal(result.findings.some((finding) => finding.ruleId === "CFG-MISSING-PRODUCTION-PROFILE"), false);
});

test("integration compares real frontend and backend ports and includes related evidence", () => {
  const context = createContext({
    "frontend/src/api/client.js": 'const API_BASE = "http://localhost:9090/api";',
    "backend/src/main/resources/application.properties": "server.port=8080",
  });
  const result = runIntegrationRule(context);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].evidence, 'const API_BASE = "http://localhost:9090/api";');
  assert.equal(result.findings[0].relatedEvidence[0].evidence, "server.port=8080");
});

test("documentation checks build, configuration, and release coverage", () => {
  const context = createContext({
    "README.md": "# Sample\n\n## Local setup\n\nSet DEMO_PASSWORD in the environment.\nRun `mvn spring-boot:run`.\nThis is not a production application.\n",
  });
  const result = runDocumentationRule(context);
  assert.deepEqual(new Set(result.findings.map((finding) => finding.ruleId)), new Set([
    "DOC-BUILD-INSTRUCTIONS-MISSING",
    "DOC-DEPLOYMENT-RELEASE-PROCEDURE-MISSING",
  ]));
  assert.equal(result.findings.find((finding) => finding.ruleId === "DOC-BUILD-INSTRUCTIONS-MISSING").evidence, "Run `mvn spring-boot:run`.");
  assert.equal(result.findings.find((finding) => finding.ruleId === "DOC-DEPLOYMENT-RELEASE-PROCEDURE-MISSING").evidence, "This is not a production application.");
});

test("dependencies warn on unlocked npm ranges without claiming CVEs", () => {
  const context = createContext({
    "frontend/package.json": JSON.stringify({
      name: "fixture",
      dependencies: { react: "^18.3.1" },
    }, null, 2),
    "backend/pom.xml": backendPom,
  });
  const result = runDependenciesRule(context);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].ruleId, "DEP-NPM-RANGE-WITHOUT-LOCKFILE");
  assert.match(result.checks[0].summary, /No live vulnerability database was queried/);
});

test("dependency lockfile suppresses the unlocked-range maintenance warning", () => {
  const context = createContext({
    "frontend/package.json": JSON.stringify({ dependencies: { react: "^18.3.1" } }, null, 2),
    "frontend/package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: {} }),
  });
  assert.equal(runDependenciesRule(context).findings.length, 0);
});

test("backend test rule reports PASS only when Maven and Surefire verify tests", async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "releaseguard-tests-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const reportDirectory = path.join(projectRoot, "backend", "target", "surefire-reports");
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(path.join(reportDirectory, "TEST-AuthServiceTest.xml"),
    '<testsuite tests="3" failures="0" errors="0" skipped="0"></testsuite>');
  const context = createContext({
    "backend/pom.xml": backendPom,
    "backend/src/test/java/com/example/AuthServiceTest.java": testSource,
  }, {
    projectRoot,
    runCommand: async () => ({ command: "mvn -B -q clean test", exitCode: 0, stdout: "ok", stderr: "", durationMs: 4, timedOut: false }),
  });
  const result = await runTestsRule(context);
  assert.equal(result.checks[0].status, CHECK_STATUS.PASS);
  assert.equal(result.checks[0].testsRun, 3);
  assert.equal(result.findings.length, 0);
});

test("backend test rule distinguishes failure, missing Maven, and timeout", async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "releaseguard-tests-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const reportDirectory = path.join(projectRoot, "backend", "target", "surefire-reports");
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(path.join(reportDirectory, "TEST-AuthServiceTest.xml"),
    '<testsuite tests="1" failures="1" errors="0" skipped="0"></testsuite>');
  const sourceFiles = {
    "backend/pom.xml": backendPom,
    "backend/src/test/java/com/example/AuthServiceTest.java": testSource,
  };
  const failure = await runTestsRule(createContext(sourceFiles, {
    projectRoot,
    runCommand: async () => {
      await writeFile(path.join(reportDirectory, "TEST-AuthServiceTest.xml"),
        '<testsuite tests="1" failures="1" errors="0" skipped="0"></testsuite>');
      return { command: "mvn clean test", exitCode: 1, stdout: "Tests failed", stderr: "", durationMs: 3, timedOut: false };
    },
  }));
  assert.equal(failure.checks[0].status, CHECK_STATUS.FAIL);
  assert.equal(failure.findings[0].status, "OPEN");

  for (const runCommand of [
    async () => ({ missingTool: "maven", exitCode: null, stdout: "", stderr: "", durationMs: 0, timedOut: false }),
    async () => ({ command: "mvn clean test", exitCode: null, stdout: "", stderr: "", durationMs: 10, timedOut: true }),
  ]) {
    const notRun = await runTestsRule(createContext(sourceFiles, { projectRoot, runCommand }));
    assert.equal(notRun.checks[0].status, CHECK_STATUS.NOT_RUN);
    assert.equal(notRun.findings[0].severity, "MEDIUM");
  }
});

test("backend test rule ignores stale Surefire reports after a failed launch", async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "releaseguard-stale-tests-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const reportDirectory = path.join(projectRoot, "backend", "target", "surefire-reports");
  await mkdir(reportDirectory, { recursive: true });
  const reportPath = path.join(reportDirectory, "TEST-AuthServiceTest.xml");
  await writeFile(reportPath, '<testsuite tests="3" failures="0" errors="0" skipped="0"></testsuite>');
  const staleTime = new Date(Date.now() - 5000);
  await utimes(reportPath, staleTime, staleTime);
  const context = createContext({
    "backend/pom.xml": backendPom,
    "backend/src/test/java/com/example/AuthServiceTest.java": testSource,
  }, {
    projectRoot,
    runCommand: async () => ({ command: "mvn clean test", exitCode: 1, stdout: "", stderr: "", durationMs: 1, timedOut: false }),
  });
  const result = await runTestsRule(context);
  assert.equal(result.checks[0].status, CHECK_STATUS.NOT_RUN);
  assert.equal(result.checks[0].testsRun, 0);
  assert.equal(result.findings[0].ruleId, "TEST-BACKEND-NOT-RUN");
});

test("build rule keeps frontend failure distinct from backend pass", async () => {
  const context = createContext({
    "frontend/package.json": '{\n  "scripts": {\n    "build": "vite build"\n  }\n}',
    "backend/pom.xml": backendPom,
  }, {
    runCommand: async (commandId) => commandId === "shopsphereFrontendBuild"
      ? { command: "npm run build", exitCode: 1, stdout: "Missing index.html", stderr: "", durationMs: 5, timedOut: false }
      : { command: "mvn package", exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false },
  });
  const result = await runBuildRule(context);
  assert.deepEqual(result.checks.map((check) => check.status), [CHECK_STATUS.FAIL, CHECK_STATUS.PASS]);
  assert.equal(result.findings[0].ruleId, "BUILD-FRONTEND-FAILED");
  assert.equal(result.findings[0].evidence, '"build": "vite build"');
});

test("build rule reports missing npm and Maven as NOT RUN", async () => {
  const context = createContext({
    "frontend/package.json": '{\n  "scripts": {\n    "build": "vite build"\n  }\n}',
    "backend/pom.xml": backendPom,
  }, {
    runCommand: async (commandId) => ({
      command: null,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      timedOut: false,
      missingTool: commandId === "shopsphereFrontendBuild" ? "npm" : "maven",
    }),
  });
  const result = await runBuildRule(context);
  assert.deepEqual(result.checks.map((check) => check.status), [CHECK_STATUS.NOT_RUN, CHECK_STATUS.NOT_RUN]);
  assert.ok(result.findings.every((finding) => finding.ruleId.endsWith("NOT-RUN")));
});

test("file walker path resolver rejects traversal and permits a contained file", () => {
  const root = path.resolve(os.tmpdir(), "releaseguard-project");
  assert.equal(resolveProjectFile(root, "backend/pom.xml"), path.join(root, "backend", "pom.xml"));
  assert.throws(() => resolveProjectFile(root, "../outside.txt"), /inside the demo repository/);
  assert.throws(() => resolveProjectFile(root, path.resolve(root, "outside.txt")), /inside the demo repository/);
});

test("file walker rejects a project root that resolves through a symlink", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "releaseguard-root-link-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const actualRoot = path.join(parent, "actual-project");
  const linkedRoot = path.join(parent, "demo-project");
  await mkdir(actualRoot, { recursive: true });
  await writeFile(path.join(actualRoot, "README.md"), "outside the configured project");

  try {
    await symlink(actualRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip("Symbolic links are not available in this environment");
      return;
    }
    throw error;
  }

  await assert.rejects(walkProject(linkedRoot), /must not resolve through a symbolic link/);
});

test("finding identity is stable across line movement and changes with evidence", () => {
  const details = {
    ruleId: "SEC-HARDCODED-CREDENTIAL",
    category: "Security",
    severity: "LOW",
    title: "Synthetic marker",
    affectedFile: "backend/application.properties",
    explanation: "Test finding",
    risk: "Test risk",
    recommendedFix: "Remove the value",
    remediationHint: "Test hint",
  };
  const firstContext = createContext({
    "backend/application.properties": "# header\npassword=demo-only-not-a-secret",
  });
  const shiftedContext = createContext({
    "backend/application.properties": "# new header\n# line moved\npassword=demo-only-not-a-secret",
  });
  const changedContext = createContext({
    "backend/application.properties": "# header\npassword=another-fake-value",
  });
  const first = createFinding(firstContext, { ...details, startLine: 2 });
  const shifted = createFinding(shiftedContext, { ...details, startLine: 3 });
  const changed = createFinding(changedContext, { ...details, startLine: 2 });

  assert.equal(first.id, shifted.id);
  assert.notEqual(first.id, changed.id);
  assert.match(first.id, /^SEC-HARDCODED-CREDENTIAL:[a-f0-9]{20}$/);
  assert.equal(first.evidenceFingerprint.length, 64);
});

test("file walker excludes generated, dependency, and build directories", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "releaseguard-walk-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const relativePath of [
    "README.md",
    "node_modules/example/index.js",
    "backend/target/classes/App.class",
    ".github/modernize/session/plan.md",
  ]) {
    const destination = path.join(root, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, "fixture data");
  }
  const walked = await walkProject(root);
  assert.deepEqual(walked.map((file) => file.relativePath), ["README.md"]);
});

test("score is severity-weighted and high findings enforce the release gate", () => {
  const findings = [{ severity: "HIGH", status: "OPEN" }, { severity: "MEDIUM", status: "OPEN" }];
  assert.equal(computeScore(findings), 80);
  assert.equal(deriveReleaseStatus(findings, []), "RELEASE BLOCKED");
  assert.equal(deriveReleaseStatus([], [{ category: "Tests", status: CHECK_STATUS.NOT_RUN }]), "VALIDATION INCOMPLETE");
});

test("severity handling ignores resolved and unknown severities and warnings do not block", () => {
  const findings = [
    { severity: "CRITICAL", status: "RESOLVED" },
    { severity: "UNKNOWN", status: "OPEN" },
    { severity: "MEDIUM", status: "OPEN" },
    { severity: "LOW", status: "OPEN" },
  ];
  assert.equal(computeScore(findings), 93);
  assert.equal(deriveReleaseStatus(findings, [{ category: "Build", status: CHECK_STATUS.PASS }]), "READY FOR REVIEW");
  assert.equal(deriveReleaseStatus([{ severity: "CRITICAL", status: "OPEN" }], []), "RELEASE BLOCKED");
});
