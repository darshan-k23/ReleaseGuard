import { randomUUID } from "node:crypto";
import { DEMO_PROJECT_ROOT } from "./projectRoot.js";
import { createCheck, CHECK_STATUS, CATEGORIES } from "./types.js";
import { walkProject } from "./utils/fileWalker.js";
import { runAllowlistedCommand } from "./utils/commandRunner.js";
import { runSecurityRule } from "./rules/security.js";
import { runConfigurationRule } from "./rules/configuration.js";
import { runIntegrationRule } from "./rules/integration.js";
import { runDocumentationRule } from "./rules/documentation.js";
import { runDependenciesRule } from "./rules/dependencies.js";
import { runTestsRule } from "./rules/tests.js";
import { runBuildRule } from "./rules/build.js";
import { computeScore, deriveReleaseStatus, SCORE_METHOD } from "./scoring.js";

function extractXmlValue(text, tagName) {
  return new RegExp(`<${tagName}>([^<]+)<\\/${tagName}>`).exec(text)?.[1]?.trim() || null;
}

function deriveProject(files, analyzedAt = null) {
  const pom = files.find((file) => file.relativePath === "backend/pom.xml");
  const readme = files.find((file) => file.relativePath.toLowerCase() === "readme.md");
  const frontendManifest = files.find((file) => file.relativePath === "frontend/package.json");
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
  const bootVersion = extractXmlValue(parent, "version");
  const javaVersion = pom?.text.match(/<java\.version>([^<]+)<\/java\.version>/)?.[1] || null;
  if (bootVersion) stack.push(`Spring Boot ${bootVersion}`);
  if (javaVersion) stack.push(`Java ${javaVersion}`);
  if (pom) stack.push("Maven");

  const heading = readme?.text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return {
    name: heading || extractXmlValue(pom?.text || "", "name") || "ShopSphere",
    description: extractXmlValue(pom?.text || "", "description") || "ShopSphere demo repository",
    stack,
    repository: "demo-project",
    lastAnalyzed: analyzedAt,
  };
}

export async function getProjectMetadata() {
  const files = await walkProject(DEMO_PROJECT_ROOT);
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
  const testCheck = checks.find((check) => check.id === "shopsphere-backend-tests");
  const frontendBuild = checks.find((check) => check.id === "shopsphere-frontend-build");
  const backendBuild = checks.find((check) => check.id === "shopsphere-backend-build");
  return {
    issuesFound: findings.length,
    criticalBlockers: findings.filter((finding) =>
      ["CRITICAL", "HIGH"].includes(finding.severity),
    ).length,
    warnings: findings.filter((finding) =>
      ["MEDIUM", "LOW"].includes(finding.severity),
    ).length,
    testStatus: testCheck?.status || CHECK_STATUS.NOT_RUN,
    testsChecked: testCheck?.testsRun || 0,
    testsPassed: testCheck?.testsPassed || 0,
    testsFailed: testCheck?.testsFailed || 0,
    frontendBuildStatus: frontendBuild?.status || CHECK_STATUS.NOT_RUN,
    backendBuildStatus: backendBuild?.status || CHECK_STATUS.NOT_RUN,
  };
}

function createStatusSummary(status, findings, checks) {
  const highFindings = findings.filter((finding) =>
    ["CRITICAL", "HIGH"].includes(finding.severity),
  ).length;
  const testCheck = checks.find((check) => check.id === "shopsphere-backend-tests");
  const failedChecks = checks.filter((check) => check.status === CHECK_STATUS.FAIL);
  const unrunChecks = checks.filter((check) => check.status === CHECK_STATUS.NOT_RUN);
  const validationSummary = testCheck
    ? `Backend tests ${testCheck.status.toLowerCase()} (${testCheck.testsPassed}/${testCheck.testsRun} passed).`
    : "Backend test result unavailable.";

  if (status === "RELEASE BLOCKED") {
    return `Release blocked by ${highFindings} open high/critical finding(s)${failedChecks.length ? ` and ${failedChecks.length} failed validation check(s)` : ""}. ${validationSummary} This is not a production-readiness certification.`;
  }
  if (status === "VALIDATION INCOMPLETE") {
    return `No high-severity blocker was found, but ${unrunChecks.length} validation check(s) did not run. ${validationSummary} Manual review is required.`;
  }
  return `No high-severity blocker was found and the available checks completed. ${validationSummary} Manual release review is still required.`;
}

export async function analyzeRepository() {
  const startedAt = Date.now();
  const files = await walkProject(DEMO_PROJECT_ROOT);
  const context = {
    projectRoot: DEMO_PROJECT_ROOT,
    files,
    byPath: new Map(files.map((file) => [file.relativePath, file])),
    runCommand: (commandId) => runAllowlistedCommand(commandId, DEMO_PROJECT_ROOT),
  };

  const staticResults = [
    runSecurityRule(context),
    runConfigurationRule(context),
    runIntegrationRule(context),
    runDocumentationRule(context),
    runDependenciesRule(context),
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
    analysisId: randomUUID(),
    project: deriveProject(files, analyzedAt),
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
