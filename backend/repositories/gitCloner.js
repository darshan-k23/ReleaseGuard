import { spawn } from "node:child_process";
import path from "node:path";

const DEFAULT_CLONE_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_CHARS = 12_000;

/**
 * Sanitizes command output and error messages by stripping ANSI codes
 * and redacting tokens, keys, passwords, and sensitive URLs.
 */
export function sanitizeErrorOutput(value) {
  if (!value) return "";
  return String(value)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\r\n,;]+/gi, "$1[REDACTED]")
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED]")
    .replace(
      /(password|passwd|secret|token|api[_-]?key|client[_-]?secret|private[_-]?key)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s,;]+)/gi,
      "$1$2[REDACTED]",
    )
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED KEY]")
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[REDACTED]@")
    .replace(/[A-Za-z0-9_-]+:[A-Za-z0-9_-]+@github\.com/gi, "[REDACTED]@github.com")
    .slice(0, MAX_OUTPUT_CHARS);
}

/**
 * Executes a git command safely using child_process.spawn with an argument array
 * and shell: false to guarantee no shell interpolation or command injection.
 */
export function executeGitCommand(args, { cwd, timeoutMs = DEFAULT_CLONE_TIMEOUT_MS, platform = process.platform } = {}) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn("git", args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "echo",
      },
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
        const terminator = spawn(taskkillPath, ["/pid", String(child.pid), "/t", "/f"], {
          windowsHide: true,
          stdio: "ignore",
        });
        terminator.on("error", () => child.kill("SIGKILL"));
      } else {
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (stdout.length < MAX_OUTPUT_CHARS) {
        stdout += chunk.toString().slice(0, MAX_OUTPUT_CHARS - stdout.length);
      }
    });

    child.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_OUTPUT_CHARS) {
        stderr += chunk.toString().slice(0, MAX_OUTPUT_CHARS - stderr.length);
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Failed to execute git process: ${sanitizeErrorOutput(err.message)}`));
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error(`Git command timed out after ${timeoutMs}ms.`));
      } else if (exitCode !== 0) {
        const errorDetail = sanitizeErrorOutput(stderr || stdout || `Git process exited with code ${exitCode}`);
        reject(new Error(errorDetail));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Clones a repository safely into target workspace and extracts branch and HEAD SHA.
 */
export async function cloneRepository({
  repositoryUrl,
  workspacePath,
  branch = null,
  timeoutMs = DEFAULT_CLONE_TIMEOUT_MS,
  runGit = executeGitCommand,
} = {}) {
  // Safe argument construction - no shell interpolation
  const cloneArgs = ["clone", "--depth", "1"];
  if (branch) {
    cloneArgs.push("--branch", branch);
  }
  cloneArgs.push(repositoryUrl, workspacePath);

  await runGit(cloneArgs, { timeoutMs });

  // Capture current branch
  let capturedBranch = branch || null;
  try {
    const branchOutput = await runGit(["-C", workspacePath, "rev-parse", "--abbrev-ref", "HEAD"], { timeoutMs: 10_000 });
    const trimmed = branchOutput.stdout.trim();
    if (trimmed && trimmed !== "HEAD") {
      capturedBranch = trimmed;
    }
  } catch {
    // If detached HEAD or unavailable, fallback gracefully
  }

  // Capture HEAD commit SHA
  let commitSha = null;
  try {
    const shaOutput = await runGit(["-C", workspacePath, "rev-parse", "HEAD"], { timeoutMs: 10_000 });
    const trimmedSha = shaOutput.stdout.trim();
    if (trimmedSha) {
      commitSha = trimmedSha;
    }
  } catch {
    //
  }

  return {
    branch: capturedBranch || "main",
    commitSha,
  };
}
