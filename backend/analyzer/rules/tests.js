import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createCheck, CHECK_STATUS } from "../types.js";
import { createFinding, findLine } from "../utils/evidence.js";

async function readSurefireSummary(projectRoot) {
  const reportDirectory = path.join(projectRoot, "backend", "target", "surefire-reports");
  let reportNames;
  try {
    reportNames = await readdir(reportDirectory);
  } catch {
    return { testsRun: 0, testsFailed: 0, testsSkipped: 0 };
  }

  const totals = { testsRun: 0, testsFailed: 0, testsSkipped: 0, generatedAt: 0 };
  for (const reportName of reportNames.filter((name) => /^TEST-.*\.xml$/.test(name))) {
    const reportPath = path.join(reportDirectory, reportName);
    const reportText = await readFile(reportPath, "utf8");
    totals.generatedAt = Math.max(totals.generatedAt, (await stat(reportPath)).mtimeMs);
    const attributes = reportText.match(/<testsuite\b[^>]*>/)?.[0] || "";
    const value = (name) => Number(new RegExp(`${name}="(\\d+)"`).exec(attributes)?.[1] || 0);
    totals.testsRun += value("tests");
    totals.testsFailed += value("failures") + value("errors");
    totals.testsSkipped += value("skipped");
  }
  return totals;
}

function testEvidence(context) {
  const source = context.files.find((file) =>
    /(^|\/)backend\/src\/test\/.*\.java$/i.test(file.relativePath),
  );
  if (source) {
    const lineNumber = findLine(source, (line) => /@Test\b/.test(line)) || 1;
    return { source, lineNumber };
  }
  const pom = context.files.find((file) => file.relativePath.endsWith("backend/pom.xml"));
  return pom ? { source: pom, lineNumber: findLine(pom, (line) => /spring-boot-starter-test/.test(line)) || 1 } : null;
}

export async function runTestsRule(context) {
  const findings = [];
  const checks = [];

  // 1. Authoritative validation context if provided
  if (context.validation && Array.isArray(context.validation.executions)) {
    const testExecutions = context.validation.executions.filter((e) =>
      e.command && (e.command.includes("test") || e.command.includes("pytest")),
    );

    for (const exec of testExecutions) {
      const isPass = exec.status === "PASS";
      const isFail = exec.status === "FAIL";
      const status = isPass ? CHECK_STATUS.PASS : isFail ? CHECK_STATUS.FAIL : CHECK_STATUS.NOT_RUN;
      const target = exec.workingDirectory && exec.workingDirectory !== "." ? exec.workingDirectory : "root";
      const checkId = `${target.replace(/[^a-zA-Z0-9_-]/g, "-")}-tests`;

      checks.push(
        createCheck({
          id: checkId,
          category: "Tests",
          status,
          summary: isPass
            ? `Test suite completed successfully (${exec.command}).`
            : isFail
              ? `Test suite failed with exit code ${exec.exitCode} (${exec.command}).`
              : `Tests were not run (${exec.command}): ${exec.stderr || "Execution skipped"}.`,
          command: exec.command,
          exitCode: exec.exitCode,
          stdout: exec.stdout,
          stderr: exec.stderr,
          durationMs: exec.durationMs,
          reason: !isPass && !isFail ? exec.stderr : null,
          timedOut: exec.status === "TIMEOUT",
          testsRun: isPass ? 1 : isFail ? 1 : 0,
          testsPassed: isPass ? 1 : 0,
          testsFailed: isFail ? 1 : 0,
        }),
      );
    }
    return { findings, checks };
  }

  // 2. Standalone fallback based only on detected manifests in context.files
  const backendPom = context.files.find((file) => file.relativePath.endsWith("backend/pom.xml") || file.relativePath === "pom.xml");
  const testSources = context.files.filter((file) =>
    /(^|\/)backend\/src\/test\/.*\.(?:java|kt)$/i.test(file.relativePath),
  );
  const rootNodeManifest = context.files.find((file) => file.relativePath === "package.json");

  if (backendPom && testSources.length > 0) {
    const commandStartedAt = Date.now();
    const commandResult = await context.runCommand("shopsphereBackendTests");
    const reports = commandResult.missingTool || commandResult.timedOut
      ? { testsRun: 0, testsFailed: 0, testsSkipped: 0, generatedAt: 0 }
      : await readSurefireSummary(context.projectRoot);
    if (
      commandResult.exitCode !== 0 &&
      reports.generatedAt < commandStartedAt - 1000
    ) {
      reports.testsRun = 0;
      reports.testsFailed = 0;
      reports.testsSkipped = 0;
    }
    const testsPassed = Math.max(0, reports.testsRun - reports.testsFailed - reports.testsSkipped);
    let status = CHECK_STATUS.FAIL;
    let summary = `Maven reported ${reports.testsRun} test(s), ${testsPassed} passed, ${reports.testsFailed} failed, and ${reports.testsSkipped} skipped.`;
    let reason = null;

    if (commandResult.missingTool) {
      status = CHECK_STATUS.NOT_RUN;
      reason = `Required tool unavailable: ${commandResult.missingTool}`;
      summary = "Backend tests were not run because Maven is unavailable.";
    } else if (commandResult.timedOut) {
      status = CHECK_STATUS.NOT_RUN;
      reason = "Test command timed out";
      summary = "Backend tests did not complete before the execution timeout.";
    } else if (commandResult.exitCode === 0 && reports.testsRun > 0 && reports.testsFailed === 0) {
      status = CHECK_STATUS.PASS;
      summary = `Maven completed ${testsPassed} backend test(s) successfully.`;
    } else if (commandResult.exitCode === 0 && reports.testsRun === 0) {
      status = CHECK_STATUS.NOT_RUN;
      reason = "No Surefire test results were produced";
      summary = "Maven exited successfully but no test results were found; this is not reported as a pass.";
    } else if (commandResult.exitCode !== 0 && reports.testsRun === 0) {
      status = CHECK_STATUS.NOT_RUN;
      reason = "Maven exited before producing fresh test results";
      summary = "The Maven test command did not produce fresh test results; assertions are not reported as passed or failed.";
    } else if (commandResult.exitCode !== 0 && reports.testsFailed === 0) {
      summary = `Maven exited ${commandResult.exitCode} after reporting ${reports.testsRun} test(s) with no assertion failures; the command did not complete successfully.`;
    }

    if (status !== CHECK_STATUS.PASS) {
      const evidence = testEvidence(context);
      if (evidence) {
        const isFailure = status === CHECK_STATUS.FAIL;
        findings.push(
          createFinding(context, {
            ruleId: isFailure ? "TEST-BACKEND-FAILED" : "TEST-BACKEND-NOT-RUN",
            category: "Tests",
            severity: isFailure ? "HIGH" : "MEDIUM",
            title: isFailure ? "Backend tests failed" : "Backend tests were not verified",
            affectedFile: evidence.source.relativePath,
            startLine: evidence.lineNumber,
            explanation: isFailure
              ? `The allowlisted Maven test command exited ${commandResult.exitCode}; see the captured, redacted output in this analysis checks.`
              : `The test command did not produce a verified result: ${reason}. No pass or fail is inferred.`,
            risk: "Without a completed test result, regressions in backend behavior remain unverified.",
            recommendedFix: isFailure
              ? "Review the failing test output and repair the affected behavior or expectation, then rerun Maven tests."
              : "Make the required Maven/JDK tool available or resolve the timeout, then rerun backend tests.",
            remediationHint: "Ask IBM Bob to inspect the test output and propose a focused fix; rerun the same test command afterward.",
            confidence: isFailure ? 0.99 : 0.95,
          }),
        );
      }
    }

    checks.push(createCheck({
      id: "backend-tests",
      category: "Tests",
      status,
      summary,
      command: commandResult.command,
      exitCode: commandResult.exitCode,
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
      durationMs: commandResult.durationMs,
      reason: reason || (commandResult.missingTool ? `Required tool unavailable: ${commandResult.missingTool}` : null),
      timedOut: commandResult.timedOut,
      testsRun: reports.testsRun,
      testsPassed,
      testsFailed: reports.testsFailed,
    }));
  } else if (rootNodeManifest) {
    let hasTest = false;
    try {
      const parsed = JSON.parse(rootNodeManifest.text);
      hasTest = Boolean(parsed.scripts?.test);
    } catch {}

    if (hasTest) {
      const rootResult = await context.runCommand("nodeTests");
      const rootStatus = resultStatus(rootResult);
      checks.push(createCheck({
        id: "root-tests",
        category: "Tests",
        status: rootStatus,
        summary: rootStatus === CHECK_STATUS.PASS
          ? "Node test suite completed successfully."
          : rootStatus === CHECK_STATUS.FAIL
            ? "Node test suite failed."
            : "Node test suite was not run.",
        command: rootResult.command,
        exitCode: rootResult.exitCode,
        stdout: rootResult.stdout,
        stderr: rootResult.stderr,
        durationMs: rootResult.durationMs,
        reason: rootResult.missingTool
          ? `Required tool unavailable: ${rootResult.missingTool}`
          : rootResult.timedOut
            ? "Test command timed out"
            : null,
        timedOut: rootResult.timedOut,
      }));
    }
  }

  return { findings, checks };
}

export { readSurefireSummary };
