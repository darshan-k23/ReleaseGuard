import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readdir, readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { generateDemoRepositories } from "./generate.js";
import { analyzeRepository } from "../backend/analyzer/index.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const testOutputDir = path.resolve(currentDir, "..", "demo-repositories");

test("demo generator creates 6 runnable repositories with real files and no report JSONs", async () => {
  await generateDemoRepositories(testOutputDir);

  const repos = await readdir(testOutputDir);
  const expectedRepos = [
    "build-failing",
    "configuration-risk",
    "critically-blocked",
    "release-ready",
    "security-blocked",
    "warning-only",
  ];

  for (const expected of expectedRepos) {
    assert.ok(repos.includes(expected), `Missing demo repository: ${expected}`);
  }

  for (const repo of expectedRepos) {
    const repoPath = path.join(testOutputDir, repo);
    const files = await readdir(repoPath);

    // Verify presence of README.md and package.json
    assert.ok(files.includes("README.md"), `${repo} missing README.md`);
    assert.ok(files.includes("package.json"), `${repo} missing package.json`);
    assert.ok(files.includes("src"), `${repo} missing src directory`);
    assert.ok(files.includes("test"), `${repo} missing test directory`);

    // Ensure NO predetermined report JSONs are generated
    assert.ok(!files.includes("release-report.json"), `${repo} contains report JSON`);
    assert.ok(!files.includes("issues.json"), `${repo} contains issues JSON`);
    assert.ok(!files.includes("release-plan.json"), `${repo} contains release plan JSON`);

    // Verify README explains baseline conditions
    const readmeContent = await readFile(path.join(repoPath, "README.md"), "utf8");
    assert.ok(readmeContent.includes("Intentional Baseline Conditions") || readmeContent.includes("clean release candidate"));
  }
});

test("ReleaseGuard analyzer evaluates generated repositories dynamically", async () => {
  // 1. release-ready has 0 findings and score 100
  const readyAnalysis = await analyzeRepository(path.join(testOutputDir, "release-ready"));
  assert.equal(readyAnalysis.findings.length, 0);
  assert.equal(readyAnalysis.score, 100);
  assert.notEqual(readyAnalysis.status, "RELEASE BLOCKED");

  // 2. warning-only has only warnings (no high blockers)
  const warningAnalysis = await analyzeRepository(path.join(testOutputDir, "warning-only"));
  assert.ok(warningAnalysis.findings.length > 0);
  assert.ok(warningAnalysis.findings.every((f) => f.severity !== "HIGH" && f.severity !== "CRITICAL"));
  assert.ok(warningAnalysis.score >= 80);

  // 3. configuration-risk detects port mismatch and config issues
  const configAnalysis = await analyzeRepository(path.join(testOutputDir, "configuration-risk"));
  assert.ok(configAnalysis.findings.some((f) => f.ruleId === "INT-API-PORT-MISMATCH"));
  assert.ok(configAnalysis.findings.some((f) => f.ruleId === "CFG-MISSING-PRODUCTION-PROFILE"));

  // 4. security-blocked detects synthetic secret and debug logging
  const securityAnalysis = await analyzeRepository(path.join(testOutputDir, "security-blocked"));
  assert.ok(securityAnalysis.findings.some((f) => f.ruleId === "SEC-HARDCODED-CREDENTIAL"));
  assert.ok(securityAnalysis.findings.some((f) => f.ruleId === "SEC-DEBUG-LOGGING"));

  // 5. critically-blocked detects compound issues and is release blocked
  const criticalAnalysis = await analyzeRepository(path.join(testOutputDir, "critically-blocked"));
  assert.ok(criticalAnalysis.findings.length >= 3);
  assert.equal(criticalAnalysis.status, "RELEASE BLOCKED");
});
