import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createWorkspace, removeWorkspace, workspaceExists, resolveWorkspacePath } from "../repositories/workspace.js";
import { RemediationStore } from "./remediationStore.js";
import { REMEDIATION_STATUS } from "./types.js";
import { executeIsolatedRemediation } from "./isolatedRemediation.js";
import { applyPatchToFileContent, generateUnifiedDiff } from "./patcher.js";

test("patcher: applies unified diff hunk cleanly", () => {
  const original = "line1\npassword=secret123\nline3\n";
  const patch = `--- a/application.properties\n+++ b/application.properties\n@@ -1,3 +1,3 @@\n line1\n-password=secret123\n+password=\${DB_PASS}\n line3`;
  const result = applyPatchToFileContent(original, patch);
  assert.ok(result.includes("password=${DB_PASS}"));
  assert.ok(!result.includes("secret123"));
});

test("patcher: applies simple line replacement diff", () => {
  const original = "server.port=8080\nspring.datasource.password=cleartext\n";
  const patch = "- spring.datasource.password=cleartext\n+ spring.datasource.password=${DB_PASSWORD}";
  const result = applyPatchToFileContent(original, patch);
  assert.ok(result.includes("spring.datasource.password=${DB_PASSWORD}"));
  assert.ok(!result.includes("cleartext"));
});

test("patcher: generates accurate unified diff", () => {
  const before = "alpha\nbeta\ngamma\n";
  const after = "alpha\nbeta-fixed\ngamma\n";
  const diff = generateUnifiedDiff("test.txt", before, after);
  assert.ok(diff.includes("--- a/test.txt"));
  assert.ok(diff.includes("+++ b/test.txt"));
  assert.ok(diff.includes("-beta"));
  assert.ok(diff.includes("+beta-fixed"));
});

test("executeIsolatedRemediation creates before/after workspaces, applies patch to after only, and preserves original", async () => {
  const jobId = "test-iso-job-1";
  const origWsPath = await createWorkspace(jobId);
  const targetRelFile = "application.properties";
  const originalContent = "server.port=8080\nspring.datasource.password=hardcoded123\nlogging.level.root=DEBUG\n";
  await writeFile(path.join(origWsPath, targetRelFile), originalContent, "utf8");
  await writeFile(
    path.join(origWsPath, "README.md"),
    "# ShopSphere\n\nRun npm run build\n\n## Deployment\nDeploy steps.\n",
    "utf8",
  );

  const remediationStore = new RemediationStore();
  const findingId = "SEC-01:hash-123";
  const candidate = remediationStore.create({
    jobId,
    findingId,
    files: [targetRelFile],
    proposedChanges: [
      {
        file: targetRelFile,
        description: "Externalize database password",
        patch: "- spring.datasource.password=hardcoded123\n+ spring.datasource.password=${DB_PASSWORD}",
      },
    ],
    status: REMEDIATION_STATUS.PROPOSED,
  });

  const finding = {
    id: findingId,
    ruleId: "SEC-01",
    category: "Security",
    severity: "HIGH",
    file: targetRelFile,
    evidence: "spring.datasource.password=hardcoded123",
  };

  const result = await executeIsolatedRemediation({
    jobId,
    candidate,
    finding,
    remediationStore,
    runValidate: async () => ({
      status: "PASS",
      passed: true,
      summary: { total: 1, passed: 1, failed: 0, notRun: 0, timeouts: 0, toolUnavailable: 0 },
      executions: [],
    }),
  });

  // Verify before and after workspaces exist on disk
  const beforeWsPath = resolveWorkspacePath(`${jobId}-before`);
  const afterWsPath = resolveWorkspacePath(`${jobId}-after`);
  assert.equal(await workspaceExists(`${jobId}-before`), true);
  assert.equal(await workspaceExists(`${jobId}-after`), true);

  // Original repository MUST remain unchanged!
  const currentOrigContent = await readFile(path.join(origWsPath, targetRelFile), "utf8");
  assert.equal(currentOrigContent, originalContent, "Original repository was modified!");

  // Before workspace has original content
  const beforeContent = await readFile(path.join(beforeWsPath, targetRelFile), "utf8");
  assert.equal(beforeContent, originalContent);

  // After workspace has patched content
  const afterContent = await readFile(path.join(afterWsPath, targetRelFile), "utf8");
  assert.ok(afterContent.includes("spring.datasource.password=${DB_PASSWORD}"));
  assert.ok(!afterContent.includes("hardcoded123"));

  // Verify return structure
  assert.ok(result.before);
  assert.ok(result.after);
  assert.ok(result.diff);
  assert.ok(result.diff.includes("-spring.datasource.password=hardcoded123"));
  assert.ok(result.diff.includes("+spring.datasource.password=${DB_PASSWORD}"));
  assert.deepEqual(result.changedFiles, [targetRelFile]);
  assert.ok(result.validation);
  assert.equal(result.validation.status, "PASS");
  assert.ok(Array.isArray(result.resolvedFindings));
  assert.ok(Array.isArray(result.remainingFindings));
  assert.equal(typeof result.scoreBefore, "number");
  assert.equal(typeof result.scoreAfter, "number");
  assert.ok(result.scoreAfter > result.scoreBefore, "Score should improve after removing high blocker");
  assert.equal(result.status, REMEDIATION_STATUS.VALIDATED);

  // Store status updated
  const storedCandidate = remediationStore.get(candidate.remediationId);
  assert.equal(storedCandidate.status, REMEDIATION_STATUS.VALIDATED);

  // Cleanup
  await removeWorkspace(jobId);
  await removeWorkspace(`${jobId}-before`);
  await removeWorkspace(`${jobId}-after`);
});

test("executeIsolatedRemediation sets status = PATCH_FAILED when patch cannot be applied", async () => {
  const jobId = "test-iso-patch-fail";
  const origWsPath = await createWorkspace(jobId);
  await writeFile(path.join(origWsPath, "app.js"), "console.log('hello');\n", "utf8");

  const remediationStore = new RemediationStore();
  const candidate = remediationStore.create({
    jobId,
    findingId: "SEC-02",
    files: ["app.js"],
    proposedChanges: [
      {
        file: "app.js",
        description: "Bad patch",
        patch: "- non_existent_code_line_xyz\n+ replacement_code",
      },
    ],
  });

  await assert.rejects(
    async () => {
      await executeIsolatedRemediation({
        jobId,
        candidate,
        remediationStore,
      });
    },
    (err) => {
      assert.equal(err.code, "PATCH_FAILED");
      return true;
    },
  );

  const storedCandidate = remediationStore.get(candidate.remediationId);
  assert.equal(storedCandidate.status, REMEDIATION_STATUS.PATCH_FAILED);

  await removeWorkspace(jobId);
  await removeWorkspace(`${jobId}-before`);
  await removeWorkspace(`${jobId}-after`);
});

test("executeIsolatedRemediation sets status = VALIDATION_FAILED when deterministic validation fails", async () => {
  const jobId = "test-iso-val-fail";
  const origWsPath = await createWorkspace(jobId);
  await writeFile(path.join(origWsPath, "server.properties"), "key=value1\n", "utf8");

  const remediationStore = new RemediationStore();
  const candidate = remediationStore.create({
    jobId,
    findingId: "CONF-01",
    files: ["server.properties"],
    proposedChanges: [
      {
        file: "server.properties",
        description: "Change value",
        patch: "- key=value1\n+ key=value2",
      },
    ],
  });

  const result = await executeIsolatedRemediation({
    jobId,
    candidate,
    remediationStore,
    runValidate: async () => ({
      status: "FAIL",
      passed: false,
      summary: { total: 1, passed: 0, failed: 1, notRun: 0, timeouts: 0, toolUnavailable: 0 },
      executions: [{ command: "mvn test", status: "FAIL", exitCode: 1, stdout: "", stderr: "Compilation failure" }],
    }),
  });

  assert.equal(result.status, REMEDIATION_STATUS.VALIDATION_FAILED);
  const storedCandidate = remediationStore.get(candidate.remediationId);
  assert.equal(storedCandidate.status, REMEDIATION_STATUS.VALIDATION_FAILED);

  await removeWorkspace(jobId);
  await removeWorkspace(`${jobId}-before`);
  await removeWorkspace(`${jobId}-after`);
});
