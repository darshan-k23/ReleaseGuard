#!/usr/bin/env node
/**
 * Development orchestrator.
 *
 * Starts both processes needed for local development:
 *   1. Express analyzer API on port 8090 (npm run dev --prefix backend)
 *   2. Next.js dashboard on $PORT (default 3000), proxying /api -> :8090
 *
 * Freebuff injects PORT for the managed preview; both servers bind 0.0.0.0.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function spawnChild(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: { ...process.env, ...options.env },
  });

  const pipe = (stream, out) => {
    stream.on("data", (chunk) => {
      out.write(`[${name}] ${chunk}`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on("exit", (code, signal) => {
    if (!options.restarting) {
      console.error(`[${name}] exited (code=${code} signal=${signal}); shutting down.`);
      process.exit(code ?? 1);
    }
  });

  return child;
}

// 1. Express backend API (state lives here in dev).
spawnChild("api", "npm", ["run", "dev", "--prefix", "backend"], {
  env: { PORT: "8090", HOST: "127.0.0.1" },
});

// 2. Next.js dashboard (serves the UI; /api is proxied to the Express API).
const dashboard = spawnChild("web", "npm", ["run", "dev", "--", "-H", "0.0.0.0"], {
  env: { PORT: process.env.PORT || "3000", API_PROXY_TARGET: "http://127.0.0.1:8090" },
});

function shutdown() {
  dashboard.removeAllListeners("exit");
  dashboard.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
