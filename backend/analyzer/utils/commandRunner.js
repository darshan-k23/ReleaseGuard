import { spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { DEMO_PROJECT_ROOT, isDemoProjectRoot } from "../projectRoot.js";
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_CHARS = 12_000;

const COMMANDS = {
  shopsphereFrontendBuild: {
    cwd: (projectRoot) => path.join(projectRoot, "frontend"),
    executable: "npm",
    args: ["run", "build"],
    timeoutMs: 45_000,
    requiredFile: (projectRoot) =>
      path.join(projectRoot, "frontend", "node_modules", "vite", "bin", "vite.js"),
    missingTool: "ShopSphere frontend dependencies (Vite)",
  },

  shopsphereBackendTests: {
    cwd: (projectRoot) => path.join(projectRoot, "backend"),
    executable: "maven",
    args: ["-B", "-q", "clean", "test"],
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },

  shopsphereBackendBuild: {
    cwd: (projectRoot) => path.join(projectRoot, "backend"),
    executable: "maven",
    args: ["-B", "-q", "-DskipTests", "package"],
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },

  // Generic Node.js fallback commands for non-ShopSphere demo repositories.
  // These are fixed allowlisted commands and do not use shell interpolation.
  nodeTests: {
    cwd: (projectRoot) => projectRoot,
    executable: "npm",
    args: ["test"],
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },

  nodeBuild: {
    cwd: (projectRoot) => projectRoot,
    executable: "npm",
    args: ["run", "build"],
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
};

function redactOutput(value) {
  return String(value)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(
      /(authorization\s*[:=]\s*)(?:bearer\s+)?[^\r\n,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED]")
    .replace(
      /(password|passwd|secret|token|api[_-]?key|client[_-]?secret|private[_-]?key)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s,;]+)/gi,
      "$1$2[REDACTED]",
    )
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED KEY]")
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[REDACTED]@")
    .slice(0, MAX_OUTPUT_CHARS);
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
        // Continue through PATH entries.
      }
    }
  }
  return null;
}

async function findMaven(projectRoot) {
  const wrapperNames =
    process.platform === "win32" ? ["mvnw.cmd"] : ["mvnw"];
  const wrapperRoots = [projectRoot, path.join(projectRoot, "backend")];
  for (const root of wrapperRoots) {
    for (const wrapperName of wrapperNames) {
      const candidate = path.join(root, wrapperName);
      try {
        await access(candidate);
        return candidate;
      } catch {
        // No project wrapper at this location.
      }
    }
  }

  const executableNames =
    process.platform === "win32" ? ["mvn.cmd", "mvn.exe"] : ["mvn"];
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
        // Try the next configured Maven location.
      }
    }
  }

  if (process.env.USERPROFILE) {
    const localMavenRoot = path.join(process.env.USERPROFILE, ".maven");
    try {
      const installations = (await readdir(localMavenRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("maven-"))
        .map((entry) => path.join(localMavenRoot, entry.name, "bin"))
        .reverse();
      for (const directory of installations) {
        for (const executableName of executableNames) {
          const candidate = path.join(directory, executableName);
          try {
            await access(candidate);
            return candidate;
          } catch {
            // Try the next local installation.
          }
        }
      }
    } catch {
      // No conventional per-user Maven installation.
    }
  }
  return null;
}

async function resolveExecutable(name, projectRoot) {
  if (name === "maven") return findMaven(projectRoot);
  const executableNames =
    process.platform === "win32" ? ["npm.cmd", "npm.exe"] : ["npm"];
  return executableOnPath(executableNames);
}

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
  ];
  return Object.fromEntries(
    allowedNames
      .filter((name) => process.env[name])
      .map((name) => [name, process.env[name]]),
  );
}

function windowsBatchInvocation(executable, args) {
  if (/[&|<>^%!"\r\n]/.test(executable) || args.some((argument) => !/^[A-Za-z0-9_.:=/-]+$/.test(argument))) {
    return null;
  }
  return `""${executable}" ${args.join(" ")}"`;
}

export async function runAllowlistedCommand(commandId, projectRoot = DEMO_PROJECT_ROOT, options = {}) {
  const specification = COMMANDS[commandId];
  if (!specification) {
    throw new Error("Command is not allowlisted");
  }

  const startedAt = Date.now();
  if (!isDemoProjectRoot(projectRoot)) {
    return {
      command: null,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: Date.now() - startedAt,
      timedOut: false,
      missingTool: "Command execution is restricted to the ShopSphere demo repository",
    };
  }
  projectRoot = DEMO_PROJECT_ROOT;
  if (specification.requiredFile) {
    try {
      await access(specification.requiredFile(projectRoot));
    } catch {
      return {
        command: null,
        exitCode: null,
        stdout: "",
        stderr: "",
        durationMs: Date.now() - startedAt,
        timedOut: false,
        missingTool: specification.missingTool,
      };
    }
  }

  const executable = await (options.resolveExecutable || resolveExecutable)(
    specification.executable,
    projectRoot,
  );
  if (!executable) {
    return {
      command: null,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: Date.now() - startedAt,
      timedOut: false,
      missingTool: specification.executable,
    };
  }

  const cwd = specification.cwd(projectRoot);
  const commandText = [path.basename(executable), ...specification.args].join(" ");
  const processPlatform = options.platform || process.platform;
  const spawnProcess = options.spawnProcess || spawn;
  const timeoutMs = options.timeoutMs ?? specification.timeoutMs;
  const isWindowsBatch = processPlatform === "win32" && /\.cmd$/i.test(executable);
  const invocation = isWindowsBatch
    ? windowsBatchInvocation(executable, specification.args)
    : null;
  if (isWindowsBatch && !invocation) {
    return {
      command: commandText,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: Date.now() - startedAt,
      timedOut: false,
      missingTool: "A tool path or argument contained unsupported command characters",
    };
  }
  const executablePath = isWindowsBatch
    ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe")
    : executable;
  const executableArgs = isWindowsBatch
    ? ["/d", "/s", "/c", invocation]
    : specification.args;
  const child = spawnProcess(executablePath, executableArgs, {
    cwd,
    env: sanitizedEnvironment(),
    windowsVerbatimArguments: isWindowsBatch,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let settled = false;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      timedOut = true;
      if (processPlatform === "win32" && child.pid) {
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
        terminator.on("close", (exitCode) => {
          if (exitCode !== 0) child.kill();
        });
      } else {
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const remaining = MAX_OUTPUT_CHARS * 2 - stdout.length;
      if (remaining > 0) stdout += chunk.toString().slice(0, remaining);
    });
    child.stderr.on("data", (chunk) => {
      const remaining = MAX_OUTPUT_CHARS * 2 - stderr.length;
      if (remaining > 0) stderr += chunk.toString().slice(0, remaining);
    });

    const complete = (exitCode, error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        command: commandText,
        exitCode,
        stdout: redactOutput(stdout),
        stderr: redactOutput(stderr || error?.message || ""),
        durationMs: Date.now() - startedAt,
        timedOut,
        missingTool: error?.code === "ENOENT" ? specification.executable : null,
      });
    };

    child.on("error", (error) => complete(null, error));
    child.on("close", (exitCode) => complete(exitCode));
  });
}

export function getAllowlistedCommandIds() {
  return Object.keys(COMMANDS);
}
