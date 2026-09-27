import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { detectStack } from "../analyzer/stackDetector.js";
import { sanitizeErrorOutput } from "../repositories/gitCloner.js";

export const VALIDATION_STATUS = {
  PASS: "PASS",
  FAIL: "FAIL",
  NOT_RUN: "NOT_RUN",
  TIMEOUT: "TIMEOUT",
  TOOL_UNAVAILABLE: "TOOL_UNAVAILABLE",
};

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RAW_OUTPUT_CHARS = 12_000;
const MAX_PREVIEW_CHARS = 4_000;

function sanitizedEnvironment() {
  const allowedNames = [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOME",
    "JAVA_HOME",
    "MAVEN_HOME",
    "M2_HOME",
    "NODE_ENV",
    "CI",
  ];
  return Object.fromEntries(
    allowedNames
      .filter((name) => process.env[name])
      .map((name) => [name, process.env[name]]),
  );
}

async function executableOnPath(names) {
  const pathEntries = (process.env.PATH || "").split(path.delimiter);
  for (const directory of pathEntries) {
    if (!directory) continue;
    for (const name of names) {
      const candidate = path.join(directory, name);
      try {
        await access(candidate);
        return candidate;
      } catch {
        // Continue searching PATH
      }
    }
  }
  return null;
}

export async function findExecutable(name, workingDir) {
  if (name === "mvn" || name === "maven") {
    const wrapperNames = process.platform === "win32" ? ["mvnw.cmd"] : ["mvnw"];
    for (const wrapper of wrapperNames) {
      const candidate = path.join(workingDir, wrapper);
      try {
        await access(candidate);
        return candidate;
      } catch {
        // Try next wrapper candidate
      }
    }

    const executableNames = process.platform === "win32" ? ["mvn.cmd", "mvn.exe"] : ["mvn"];
    const pathExecutable = await executableOnPath(executableNames);
    if (pathExecutable) return pathExecutable;

    for (const home of [process.env.MAVEN_HOME, process.env.M2_HOME]) {
      if (!home) continue;
      for (const executableName of executableNames) {
        const candidate = path.join(home, "bin", executableName);
        try {
          await access(candidate);
          return candidate;
        } catch {
          // Continue checking
        }
      }
    }
    return null;
  }

  if (name === "npm") {
    const executableNames = process.platform === "win32" ? ["npm.cmd", "npm.exe"] : ["npm"];
    return executableOnPath(executableNames);
  }

  return null;
}

function windowsBatchInvocation(executable, args) {
  if (
    /[&|<>^%!"\r\n]/.test(executable) ||
    args.some((arg) => !/^[A-Za-z0-9_.:=/-]+$/.test(arg))
  ) {
    return null;
  }
  return `""${executable}" ${args.join(" ")}"`;
}

function formatBoundedOutput(raw) {
  if (!raw) return { text: "", truncated: false };
  const sanitized = sanitizeErrorOutput(raw);
  if (sanitized.length <= MAX_PREVIEW_CHARS) {
    return { text: sanitized, truncated: false };
  }
  return {
    text: `${sanitized.slice(0, MAX_PREVIEW_CHARS)}\n...[OUTPUT TRUNCATED]`,
    truncated: true,
  };
}

export function createNotRunExecution({
  command,
  workingDirectory,
  reason = "Command was not run.",
}) {
  const now = new Date().toISOString();
  return {
    command,
    workingDirectory,
    startTime: now,
    endTime: now,
    durationMs: 0,
    exitCode: null,
    status: VALIDATION_STATUS.NOT_RUN,
    stdout: "",
    stderr: reason,
  };
}

export async function executeValidationCommand({
  commandName,
  args,
  workingDirectory,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  resolveTool = findExecutable,
  spawnProcess = spawn,
  platform = process.platform,
}) {
  const fullCommand = `${commandName} ${args.join(" ")}`;
  const startTime = new Date().toISOString();
  const startedAt = Date.now();

  const executable = await resolveTool(commandName, workingDirectory);
  if (!executable) {
    const endTime = new Date().toISOString();
    return {
      command: fullCommand,
      workingDirectory,
      startTime,
      endTime,
      durationMs: 0,
      exitCode: null,
      status: VALIDATION_STATUS.TOOL_UNAVAILABLE,
      stdout: "",
      stderr: `${commandName} is not available on this system.`,
    };
  }

  const isWindowsBatch = platform === "win32" && /\.cmd$/i.test(executable);
  const invocation = isWindowsBatch
    ? windowsBatchInvocation(executable, args)
    : null;

  if (isWindowsBatch && !invocation) {
    const endTime = new Date().toISOString();
    return {
      command: fullCommand,
      workingDirectory,
      startTime,
      endTime,
      durationMs: 0,
      exitCode: null,
      status: VALIDATION_STATUS.FAIL,
      stdout: "",
      stderr: "Command contained unsupported shell characters.",
    };
  }

  const executablePath = isWindowsBatch
    ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe")
    : executable;

  const executableArgs = isWindowsBatch
    ? ["/d", "/s", "/c", invocation]
    : args;

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let settled = false;

  return new Promise((resolve) => {
    const child = spawnProcess(executablePath, executableArgs, {
      cwd: workingDirectory,
      env: sanitizedEnvironment(),
      windowsVerbatimArguments: isWindowsBatch,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      if (platform === "win32" && child.pid) {
        const taskkillPath = path.join(
          process.env.SystemRoot || "C:\\Windows",
          "System32",
          "taskkill.exe",
        );
        const terminator = spawnProcess(taskkillPath, ["/pid", String(child.pid), "/t", "/f"], {
          env: sanitizedEnvironment(),
          windowsHide: true,
          stdio: "ignore",
        });
        terminator.on("error", () => child.kill());
        terminator.on("close", () => child.kill());
      } else {
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const remaining = MAX_RAW_OUTPUT_CHARS * 2 - stdout.length;
      if (remaining > 0) stdout += chunk.toString().slice(0, remaining);
    });

    child.stderr.on("data", (chunk) => {
      const remaining = MAX_RAW_OUTPUT_CHARS * 2 - stderr.length;
      if (remaining > 0) stderr += chunk.toString().slice(0, remaining);
    });

    const finalize = (exitCode, error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const endTime = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedAt);

      let status = VALIDATION_STATUS.FAIL;
      if (timedOut) {
        status = VALIDATION_STATUS.TIMEOUT;
      } else if (exitCode === 0) {
        status = VALIDATION_STATUS.PASS;
      } else if (error?.code === "ENOENT") {
        status = VALIDATION_STATUS.TOOL_UNAVAILABLE;
      }

      const boundedStdout = formatBoundedOutput(stdout);
      const boundedStderr = formatBoundedOutput(stderr || error?.message || "");

      resolve({
        command: fullCommand,
        workingDirectory,
        startTime,
        endTime,
        durationMs,
        exitCode,
        status,
        stdout: boundedStdout.text,
        stderr: boundedStderr.text,
      });
    };

    child.on("error", (err) => finalize(null, err));
    child.on("close", (exitCode) => finalize(exitCode));
  });
}

/**
 * Runs validation for detected executable ecosystems (Node, Maven).
 * Never converts NOT_RUN into PASS. Never fabricates test results.
 */
export async function runValidation({
  workspacePath,
  ecosystems = null,
  options = {},
  executeCmd = executeValidationCommand,
} = {}) {
  const detectedEcosystems = ecosystems || (await detectStack(workspacePath));
  const executions = [];

  for (const eco of detectedEcosystems) {
    if (eco.status !== "EXECUTABLE") continue;

    const manifestDir = path.dirname(path.join(workspacePath, eco.manifest));
    const relWorkingDir = path.relative(workspacePath, manifestDir) || ".";

    if (eco.ecosystem === "Node") {
      // 1. npm install
      const installResult = await executeCmd({
        commandName: "npm",
        args: ["install", "--no-audit", "--no-fund"],
        workingDirectory: manifestDir,
        timeoutMs: options.installTimeoutMs || 120_000,
        ...options,
        timeoutMs: options.installTimeoutMs || 120_000,
      });
      installResult.workingDirectory = relWorkingDir;
      executions.push(installResult);

      const installPassed = installResult.status === VALIDATION_STATUS.PASS;

      // 2. npm run build (if build script exists)
      const hasBuildScript = (eco.buildCandidates || []).some((c) =>
        c.includes("build"),
      );
      if (hasBuildScript) {
        if (!installPassed) {
          executions.push(
            createNotRunExecution({
              command: "npm run build",
              workingDirectory: relWorkingDir,
              reason: "Skipped: npm install did not pass.",
            }),
          );
        } else {
          const buildResult = await executeCmd({
            commandName: "npm",
            args: ["run", "build"],
            workingDirectory: manifestDir,
            timeoutMs: options.buildTimeoutMs || options.timeoutMs || DEFAULT_TIMEOUT_MS,
            ...options,
            timeoutMs: options.buildTimeoutMs || options.timeoutMs || DEFAULT_TIMEOUT_MS,
          });
          buildResult.workingDirectory = relWorkingDir;
          executions.push(buildResult);
        }
      }

      // 3. npm test (if test script exists)
      const hasTestScript = (eco.testCandidates || []).some((c) =>
        c.includes("test"),
      );
      if (hasTestScript) {
        if (!installPassed) {
          executions.push(
            createNotRunExecution({
              command: "npm test",
              workingDirectory: relWorkingDir,
              reason: "Skipped: npm install did not pass.",
            }),
          );
        } else {
          const testResult = await executeCmd({
            commandName: "npm",
            args: ["test"],
            workingDirectory: manifestDir,
            timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
            ...options,
          });
          testResult.workingDirectory = relWorkingDir;
          executions.push(testResult);
        }
      }
    } else if (eco.ecosystem === "Maven") {
      // 1. mvn test
      const testResult = await executeCmd({
        commandName: "mvn",
        args: ["test"],
        workingDirectory: manifestDir,
        timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
        ...options,
      });
      testResult.workingDirectory = relWorkingDir;
      executions.push(testResult);

      // 2. mvn package -DskipTests
      const packageResult = await executeCmd({
        commandName: "mvn",
        args: ["package", "-DskipTests"],
        workingDirectory: manifestDir,
        timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
        ...options,
      });
      packageResult.workingDirectory = relWorkingDir;
      executions.push(packageResult);
    }
  }

  // Derive summary metrics
  const summary = {
    total: executions.length,
    passed: executions.filter((e) => e.status === VALIDATION_STATUS.PASS).length,
    failed: executions.filter((e) => e.status === VALIDATION_STATUS.FAIL).length,
    notRun: executions.filter((e) => e.status === VALIDATION_STATUS.NOT_RUN).length,
    timeouts: executions.filter((e) => e.status === VALIDATION_STATUS.TIMEOUT).length,
    toolUnavailable: executions.filter(
      (e) => e.status === VALIDATION_STATUS.TOOL_UNAVAILABLE,
    ).length,
  };

  // Never convert NOT_RUN into PASS. All executed items must have PASS status.
  const allPassed =
    executions.length > 0 &&
    executions.every((e) => e.status === VALIDATION_STATUS.PASS);

  let overallStatus = VALIDATION_STATUS.NOT_RUN;
  if (allPassed) {
    overallStatus = VALIDATION_STATUS.PASS;
  } else if (summary.failed > 0) {
    overallStatus = VALIDATION_STATUS.FAIL;
  } else if (summary.timeouts > 0) {
    overallStatus = VALIDATION_STATUS.TIMEOUT;
  } else if (summary.toolUnavailable > 0) {
    overallStatus = VALIDATION_STATUS.TOOL_UNAVAILABLE;
  }

  return {
    workspacePath,
    status: overallStatus,
    passed: allPassed,
    summary,
    executions,
  };
}
