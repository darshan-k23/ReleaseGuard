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
  const testSources = context.files.filter((file) =>
    /(^|\/)backend\/src\/test\/.*\.(?:java|kt)$/i.test(file.relativePath),
  );
  const backendPom = context.files.find((file) => file.relativePath.endsWith("backend/pom.xml"));

  if (!backendPom || testSources.length === 0) {
    return {
      findings,
      checks: [
        createCheck({
          id: "shopsphere-backend-tests",
          category: "Tests",
          status: CHECK_STATUS.NOT_RUN,
          summary: "Backend tests were not run because a Maven project or test sources were not found.",
          reason: "Maven project or tests missing",
        }),
      ],
    };
  }

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
          title: isFailure ? "ShopSphere backend tests failed" : "ShopSphere backend tests were not verified",
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

  return {
    findings,
    checks: [
      createCheck({
        id: "shopsphere-backend-tests",
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
      }),
    ],
  };
}

export { readSurefireSummary };
