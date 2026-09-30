import { randomUUID } from "node:crypto";
import path from "node:path";
import { getDemoProjectRoot } from "./projectRoot.js";
import { createCheck, CHECK_STATUS, CATEGORIES } from "./types.js";
import { walkProject } from "./utils/fileWalker.js";
import { runAllowlistedCommand } from "./utils/commandRunner.js";
import { runSecurityRule } from "./rules/security.js";
import { runConfigurationRule } from "./rules/configuration.js";
import { runIntegrationRule } from "./rules/integration.js";
import { runDocumentationRule } from "./rules/documentation.js";
import { runDependencyRule } from "./rules/dependency.js";
import { runTestsRule } from "./rules/tests.js";
import { runBuildRule } from "./rules/build.js";
import { computeScore, deriveReleaseStatus, SCORE_METHOD } from "./scoring.js";

function extractXmlValue(text, tagName) {
  return new RegExp(`<${tagName}>([^<]+)<\\/${tagName}>`).exec(text)?.[1]?.trim() || null;
}

export function deriveProject(files, analyzedAt = null, customMetadata = {}) {
  const pom = files.find((file) => file.relativePath === "backend/pom.xml" || file.relativePath === "pom.xml" || file.relativePath.endsWith("pom.xml"));
  const readme = files.find((file) => file.relativePath.toLowerCase() === "readme.md");
  const frontendManifest = files.find((file) => file.relativePath === "frontend/package.json" || file.relativePath === "package.json" || file.relativePath.endsWith("package.json"));
  const parent = pom?.text.match(/<parent>([\s\S]*?)<\/parent>/)?.[1] || "";
  let frontend = {};
  try {
    frontend = frontendManifest ? JSON.parse(frontendManifest.text) : {};
  } catch {
    frontend = {};
  }

  const stack = [];
  if (frontend.dependencies?.react || frontend.devDependencies?.react) stack.push("React");
  if (frontend.dependencies?.vite || frontend.devDependencies?.vite) stack.push("Vite");
  if (frontend.dependencies?.express) stack.push("Express");
  if (frontend.dependencies?.next) stack.push("Next.js");
  const bootVersion = extractXmlValue(parent, "version");
  const javaVersion = pom?.text.match(/<java\.version>([^<]+)<\/java\.version>/)?.[1] || null;
  if (bootVersion) stack.push(`Spring Boot ${bootVersion}`);
  if (javaVersion) stack.push(`Java ${javaVersion}`);
  if (pom) stack.push("Maven");

  const heading = readme?.text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return {
    name: customMetadata.name || heading || extractXmlValue(pom?.text || "", "name") || frontend.name || "Repository",
    description: customMetadata.description || extractXmlValue(pom?.text || "", "description") || frontend.description || "Analyzed repository",
    stack: customMetadata.stack || stack,
    repository: customMetadata.repository || "workspace",
    lastAnalyzed: analyzedAt,
  };
}

export async function getProjectMetadata(projectRoot = getDemoProjectRoot()) {
  const files = await walkProject(projectRoot);
  return deriveProject(files);
}

function summarizeCategory(category, findings, checks) {
  const categoryFindings = findings.filter((finding) => finding.category === category);
  const categoryChecks = checks.filter((check) => check.category === category);
  const hasBlocker = categoryFindings.some((finding) =>
    ["CRITICAL", "HIGH"].includes(finding.severity),
  ) || categoryChecks.some((check) => check.status === CHECK_STATUS.FAIL);
  const hasWarnings = categoryFindings.length > 0;
  const hasNotRun = categoryChecks.some((check) => check.status === CHECK_STATUS.NOT_RUN);

  let status;
  let summary;
  if (hasBlocker) {
    status = "BLOCKER";
    summary = `${categoryFindings.length} finding(s); one or more high-severity findings or checks require remediation.`;
  } else if (hasWarnings) {
    status = "WARNING";
    summary = `${categoryFindings.length} open finding(s) require review.`;
  } else if (hasNotRun) {
    status = "NOT RUN";
    summary = "No finding was produced, but one or more checks did not run.";
  } else {
    status = "PASS";
    summary = categoryChecks.map((check) => check.summary).join(" ") || "No finding was produced by the implemented checks.";
  }

  return { name: category, status, summary };
}

function createReleasePlan(findings) {
  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return [...findings]
    .sort((left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity] || left.id.localeCompare(right.id),
    )
    .map((finding, index) => ({
      priority: index + 1,
      title: finding.title,
      description: finding.recommendedFix,
      relatedFindingId: finding.id,
      remediationHint: finding.remediationHint,
    }));
}

function createMetrics(findings, checks) {
  const testChecks = checks.filter((check) => check.category === "Tests");
  const buildChecks = checks.filter((check) => check.category === "Build");

  const overallTestStatus = testChecks.length === 0
    ? CHECK_STATUS.NOT_RUN
    : testChecks.some((c) => c.status === CHECK_STATUS.FAIL)
      ? CHECK_STATUS.FAIL
      : testChecks.every((c) => c.status === CHECK_STATUS.PASS)
        ? CHECK_STATUS.PASS
        : CHECK_STATUS.NOT_RUN;

  const overallBuildStatus = buildChecks.length === 0
    ? CHECK_STATUS.NOT_RUN
    : buildChecks.some((c) => c.status === CHECK_STATUS.FAIL)
      ? CHECK_STATUS.FAIL
      : buildChecks.every((c) => c.status === CHECK_STATUS.PASS)
        ? CHECK_STATUS.PASS
        : CHECK_STATUS.NOT_RUN;

  const totalTestsRun = testChecks.reduce((sum, c) => sum + (c.testsRun || 0), 0);
  const totalTestsPassed = testChecks.reduce((sum, c) => sum + (c.testsPassed || 0), 0);
  const totalTestsFailed = testChecks.reduce((sum, c) => sum + (c.testsFailed || 0), 0);

  const frontendBuild = checks.find((check) => check.id.includes("frontend")) || buildChecks[0];
  const backendBuild = checks.find((check) => check.id.includes("backend") || check.id.includes("maven")) || buildChecks[0];

  return {
    issuesFound: findings.length,
    criticalBlockers: findings.filter((finding) =>
      ["CRITICAL", "HIGH"].includes(finding.severity),
    ).length,
    warnings: findings.filter((finding) =>
      ["MEDIUM", "LOW"].includes(finding.severity),
    ).length,
    testStatus: overallTestStatus,
    testsChecked: totalTestsRun,
    testsPassed: totalTestsPassed,
    testsFailed: totalTestsFailed,
    frontendBuildStatus: frontendBuild?.status || overallBuildStatus,
    backendBuildStatus: backendBuild?.status || overallBuildStatus,
  };
}

function createStatusSummary(status, findings, checks) {
  const highFindings = findings.filter((finding) =>
    ["CRITICAL", "HIGH"].includes(finding.severity),
  ).length;
  const testChecks = checks.filter((check) => check.category === "Tests");
  const failedChecks = checks.filter((check) => check.status === CHECK_STATUS.FAIL);
  const unrunChecks = checks.filter((check) => check.status === CHECK_STATUS.NOT_RUN);

  let validationSummary = "Validation completed.";
  if (testChecks.length > 0) {
    const passedCount = testChecks.filter((c) => c.status === CHECK_STATUS.PASS).length;
    validationSummary = `${passedCount}/${testChecks.length} test check(s) passed.`;
  }

  if (status === "RELEASE BLOCKED") {
    return `Release blocked by ${highFindings} open high/critical finding(s)${failedChecks.length ? ` and ${failedChecks.length} failed validation check(s)` : ""}. ${validationSummary} This is not a production-readiness certification.`;
  }
  if (status === "VALIDATION INCOMPLETE") {
    return `No high-severity blocker was found, but ${unrunChecks.length} validation check(s) did not run. ${validationSummary} Manual review is required.`;
  }
  return `No high-severity blocker was found and all applicable validation checks completed. ${validationSummary} Manual release review is still required.`;
}

export async function analyzeRepository(projectRoot = getDemoProjectRoot(), options = {}) {
  const startedAt = Date.now();
  const root = path.resolve(projectRoot);
  const files = await walkProject(root);
  const context = {
    projectRoot: root,
    files,
    stack: options.stack || null,
    validation: options.validation || null,
    byPath: new Map(files.map((file) => [file.relativePath, file])),
    runCommand: options.runCommand || ((commandId) => runAllowlistedCommand(commandId, root)),
  };

  const staticResults = [
    runSecurityRule(context),
    runConfigurationRule(context),
    runIntegrationRule(context),
    runDocumentationRule(context),
    runDependencyRule(context),
  ];
  const testResult = await runTestsRule(context);
  const buildResult = await runBuildRule(context);
  const findings = [
    ...staticResults.flatMap((result) => result.findings),
    ...testResult.findings,
    ...buildResult.findings,
  ];
  const checks = [
    ...staticResults.flatMap((result) => result.checks),
    ...testResult.checks,
    ...buildResult.checks,
  ];

  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  findings.sort((left, right) =>
    severityOrder[left.severity] - severityOrder[right.severity] || left.id.localeCompare(right.id),
  );
  const categories = CATEGORIES.map((category) => summarizeCategory(category, findings, checks));
  const status = deriveReleaseStatus(findings, checks);
  const analyzedAt = new Date().toISOString();

  return {
    analysisId: options.analysisId || randomUUID(),
    project: deriveProject(files, analyzedAt, options.project || {}),
    analyzedAt,
    durationMs: Date.now() - startedAt,
    status,
    statusSummary: createStatusSummary(status, findings, checks),
    score: computeScore(findings),
    scoreMethod: SCORE_METHOD,
    categories,
    findings,
    releasePlan: createReleasePlan(findings),
    metrics: createMetrics(findings, checks),
    checks,
  };
}

export function emptyAnalysisCheck(category, id, summary, reason) {
  return createCheck({
    id,
    category,
    status: CHECK_STATUS.NOT_RUN,
    summary,
    reason,
  });
}
