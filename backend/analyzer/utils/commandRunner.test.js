import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { runAllowlistedCommand } from "./commandRunner.js";
import { DEMO_PROJECT_ROOT } from "../projectRoot.js";

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => queueMicrotask(() => child.emit("close", null));
  return child;
}

test("command runner rejects command IDs outside the allowlist", async () => {
  let launched = false;
  await assert.rejects(
    runAllowlistedCommand("run-user-shell", DEMO_PROJECT_ROOT, {
      spawnProcess: () => { launched = true; return fakeChild(); },
    }),
    /not allowlisted/,
  );
  assert.equal(launched, false);
});

test("command runner refuses roots outside ShopSphere before resolving tools", async () => {
  let resolved = false;
  const result = await runAllowlistedCommand("shopsphereBackendTests", "C:/private/repository", {
    resolveExecutable: async () => { resolved = true; return "fake-maven"; },
  });
  assert.equal(result.exitCode, null);
  assert.match(result.missingTool, /restricted to the ShopSphere demo repository/);
  assert.equal(resolved, false);
});

test("missing Maven returns a NOT RUN-compatible tool result", async () => {
  const result = await runAllowlistedCommand("shopsphereBackendTests", DEMO_PROJECT_ROOT, {
    resolveExecutable: async () => null,
  });
  assert.equal(result.exitCode, null);
  assert.equal(result.missingTool, "maven");
  assert.equal(result.timedOut, false);
});

test("command timeout terminates the child and returns no fabricated exit status", async () => {
  let terminated = false;
  const result = await runAllowlistedCommand("shopsphereBackendTests", DEMO_PROJECT_ROOT, {
    resolveExecutable: async () => "fake-maven",
    platform: "linux",
    timeoutMs: 5,
    spawnProcess: () => {
      const child = fakeChild();
      child.kill = () => {
        terminated = true;
        queueMicrotask(() => child.emit("close", null));
      };
      return child;
    },
  });
  assert.equal(result.timedOut, true);
  assert.equal(result.exitCode, null);
  assert.equal(terminated, true);
});

test("captured command output is redacted and bounded", async () => {
  const result = await runAllowlistedCommand("shopsphereBackendTests", DEMO_PROJECT_ROOT, {
    resolveExecutable: async () => "fake-maven",
    platform: "linux",
    spawnProcess: () => {
      const child = fakeChild();
      queueMicrotask(() => {
        child.stdout.end(`password="real-secret-value" ${"x".repeat(30_000)}`);
        child.stderr.end("Authorization: Bearer private-token-value\n");
        child.emit("close", 0);
      });
      return child;
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.includes("real-secret-value"), false);
  assert.match(result.stdout, /password=\[REDACTED\]/);
  assert.equal(result.stderr.includes("private-token-value"), false);
  assert.match(result.stderr, /Authorization: \[REDACTED\]/);
  assert.ok(result.stdout.length <= 12_000);
});
