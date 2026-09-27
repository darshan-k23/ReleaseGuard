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
  const checks = [];

  // 1. Authoritative validation context if provided
  if (context.validation && Array.isArray(context.validation.executions)) {
    const buildExecutions = context.validation.executions.filter((e) =>
      e.command && (e.command.includes("build") || e.command.includes("package")),
    );

    for (const exec of buildExecutions) {
      const isPass = exec.status === "PASS";
      const isFail = exec.status === "FAIL";
      const status = isPass ? CHECK_STATUS.PASS : isFail ? CHECK_STATUS.FAIL : CHECK_STATUS.NOT_RUN;
      const target = exec.workingDirectory && exec.workingDirectory !== "." ? exec.workingDirectory : "root";
      const checkId = `${target.replace(/[^a-zA-Z0-9_-]/g, "-")}-build`;

      checks.push(
        createCheck({
          id: checkId,
          category: "Build",
          status,
          summary: isPass
            ? `Build completed successfully (${exec.command}).`
            : isFail
              ? `Build failed with exit code ${exec.exitCode} (${exec.command}).`
              : `Build was not run (${exec.command}): ${exec.stderr || "Execution skipped"}.`,
          command: exec.command,
          exitCode: exec.exitCode,
          stdout: exec.stdout,
          stderr: exec.stderr,
          durationMs: exec.durationMs,
          reason: !isPass && !isFail ? exec.stderr : null,
          timedOut: exec.status === "TIMEOUT",
        }),
      );
    }
    return { findings, checks };
  }

  // 2. Standalone fallback based only on detected manifests in context.files
  const frontendManifest = context.files.find((file) => file.relativePath === "frontend/package.json");
  const backendPom = context.files.find((file) => file.relativePath === "backend/pom.xml" || file.relativePath === "pom.xml");
  const rootNodeManifest = !frontendManifest ? context.files.find((file) => file.relativePath === "package.json") : null;

  if (frontendManifest) {
    const frontendResult = await context.runCommand("shopsphereFrontendBuild");
    const frontendStatus = resultStatus(frontendResult);
    addBuildFinding(context, findings, frontendManifest, frontendResult, "frontend");
    checks.push(createCheck({
      id: "frontend-build",
      category: "Build",
      status: frontendStatus,
      summary: frontendStatus === CHECK_STATUS.PASS
        ? "Frontend production build completed."
        : frontendStatus === CHECK_STATUS.FAIL
          ? "Frontend production build failed."
          : "Frontend build was not run.",
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

  if (backendPom) {
    const backendResult = await context.runCommand("shopsphereBackendBuild");
    const backendStatus = resultStatus(backendResult);
    addBuildFinding(context, findings, backendPom, backendResult, "backend");
    checks.push(createCheck({
      id: "backend-build",
      category: "Build",
      status: backendStatus,
      summary: backendStatus === CHECK_STATUS.PASS
        ? "Backend package build completed."
        : backendStatus === CHECK_STATUS.FAIL
          ? "Backend package build failed."
          : "Backend package build was not run.",
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

  if (rootNodeManifest) {
    let hasBuild = false;
    try {
      const parsed = JSON.parse(rootNodeManifest.text);
      hasBuild = Boolean(parsed.scripts?.build);
    } catch {}

    if (hasBuild) {
      const rootResult = await context.runCommand("nodeBuild");
      const rootStatus = resultStatus(rootResult);
      checks.push(createCheck({
        id: "root-build",
        category: "Build",
        status: rootStatus,
        summary: rootStatus === CHECK_STATUS.PASS
          ? "Node build completed."
          : rootStatus === CHECK_STATUS.FAIL
            ? "Node build failed."
            : "Node build was not run.",
        command: rootResult.command,
        exitCode: rootResult.exitCode,
        stdout: rootResult.stdout,
        stderr: rootResult.stderr,
        durationMs: rootResult.durationMs,
        reason: rootResult.missingTool
          ? `Required tool unavailable: ${rootResult.missingTool}`
          : rootResult.timedOut
            ? "Build command timed out"
            : null,
        timedOut: rootResult.timedOut,
      }));
    }
  }

  return { findings, checks };
}
