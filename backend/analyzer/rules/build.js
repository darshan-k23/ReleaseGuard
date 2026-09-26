import { createCheck, CHECK_STATUS } from "../types.js";
import { createFinding, findLine } from "../utils/evidence.js";

function resultStatus(result) {
  if (result.missingTool || result.timedOut || result.exitCode === null) {
    return CHECK_STATUS.NOT_RUN;
  }
  return result.exitCode === 0 ? CHECK_STATUS.PASS : CHECK_STATUS.FAIL;
}

function addBuildFinding(context, findings, source, result, target) {
  if (!source || resultStatus(result) === CHECK_STATUS.PASS) return;
  const missingTool = Boolean(result.missingTool);
  const timedOut = Boolean(result.timedOut);
  const failed = resultStatus(result) === CHECK_STATUS.FAIL;
  const lineNumber = target === "frontend"
    ? findLine(source, (line) => /"build"\s*:/.test(line))
    : findLine(source, (line) => /<artifactId>maven-compiler-plugin|<artifactId>spring-boot-maven-plugin|<artifactId>spring-boot-starter-web/.test(line));
  if (!lineNumber) return;

  findings.push(
    createFinding(context, {
      ruleId: `BUILD-${target.toUpperCase()}-${failed ? "FAILED" : "NOT-RUN"}`,
      category: "Build",
      severity: failed ? "HIGH" : "MEDIUM",
      title: failed
        ? `ShopSphere ${target} build failed`
        : `ShopSphere ${target} build was not run`,
      affectedFile: source.relativePath,
      startLine: lineNumber,
      explanation: failed
        ? `The allowlisted ${target} build command exited ${result.exitCode}; captured output is attached to this analysis check.`
        : `The ${target} build was not verified${missingTool ? ` because ${result.missingTool} is unavailable` : timedOut ? " because the command timed out" : ""}.`,
      risk: "Buildability is unverified or failing for this part of the ShopSphere demo.",
      recommendedFix: failed
        ? "Inspect the captured build output, repair the checked-in project, and rerun its build command."
        : "Install the declared project dependencies or required build tool, then rerun the build.",
      remediationHint: "Ask IBM Bob to inspect the build output and make only the minimal source-backed repair.",
      confidence: failed ? 0.99 : 0.95,
    }),
  );
}

export async function runBuildRule(context) {
  const findings = [];
  const frontendManifest = context.files.find((file) => file.relativePath === "frontend/package.json");
  const backendPom = context.files.find((file) => file.relativePath === "backend/pom.xml");
  const checks = [];

  if (!frontendManifest) {
    checks.push(createCheck({
      id: "shopsphere-frontend-build",
      category: "Build",
      status: CHECK_STATUS.NOT_RUN,
      summary: "Frontend build was not run because frontend/package.json is missing.",
      reason: "Frontend manifest missing",
    }));
  } else {
    const frontendResult = await context.runCommand("shopsphereFrontendBuild");
    const frontendStatus = resultStatus(frontendResult);
    addBuildFinding(context, findings, frontendManifest, frontendResult, "frontend");
    checks.push(createCheck({
      id: "shopsphere-frontend-build",
      category: "Build",
      status: frontendStatus,
      summary: frontendStatus === CHECK_STATUS.PASS
        ? "ShopSphere frontend production build completed."
        : frontendStatus === CHECK_STATUS.FAIL
          ? "ShopSphere frontend production build failed."
          : "ShopSphere frontend build was not run.",
      command: frontendResult.command,
      exitCode: frontendResult.exitCode,
      stdout: frontendResult.stdout,
      stderr: frontendResult.stderr,
      durationMs: frontendResult.durationMs,
      reason: frontendResult.missingTool
        ? `Required tool unavailable: ${frontendResult.missingTool}`
        : frontendResult.timedOut
          ? "Build command timed out"
          : null,
      timedOut: frontendResult.timedOut,
    }));
  }

  if (!backendPom) {
    checks.push(createCheck({
      id: "shopsphere-backend-build",
      category: "Build",
      status: CHECK_STATUS.NOT_RUN,
      summary: "Backend build was not run because backend/pom.xml is missing.",
      reason: "Maven project missing",
    }));
  } else {
    const backendResult = await context.runCommand("shopsphereBackendBuild");
    const backendStatus = resultStatus(backendResult);
    addBuildFinding(context, findings, backendPom, backendResult, "backend");
    checks.push(createCheck({
      id: "shopsphere-backend-build",
      category: "Build",
      status: backendStatus,
      summary: backendStatus === CHECK_STATUS.PASS
        ? "ShopSphere backend package build completed (tests run separately)."
        : backendStatus === CHECK_STATUS.FAIL
          ? "ShopSphere backend package build failed."
          : "ShopSphere backend package build was not run.",
      command: backendResult.command,
      exitCode: backendResult.exitCode,
      stdout: backendResult.stdout,
      stderr: backendResult.stderr,
      durationMs: backendResult.durationMs,
      reason: backendResult.missingTool
        ? `Required tool unavailable: ${backendResult.missingTool}`
        : backendResult.timedOut
          ? "Build command timed out"
          : null,
      timedOut: backendResult.timedOut,
    }));
  }

  return { findings, checks };
}
