import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  VALIDATION_STATUS,
  createNotRunExecution,
  executeValidationCommand,
  runValidation,
} from "./validationRunner.js";

const REQUIRED_EXECUTION_FIELDS = [
  "command",
  "workingDirectory",
  "startTime",
  "endTime",
  "durationMs",
  "exitCode",
  "status",
  "stdout",
  "stderr",
].sort();

function assertWellFormedExecution(execution) {
  assert.deepEqual(Object.keys(execution).sort(), REQUIRED_EXECUTION_FIELDS);
  assert.ok(
    Object.values(VALIDATION_STATUS).includes(execution.status),
    `status '${execution.status}' is not an allowed VALIDATION_STATUS`,
  );
  assert.equal(typeof execution.command, "string");
  assert.equal(typeof execution.workingDirectory, "string");
  assert.equal(typeof execution.startTime, "string");
  assert.equal(typeof execution.endTime, "string");
  assert.equal(typeof execution.durationMs, "number");
}

/** A fake child_process handle driven entirely by the test. */
function createFakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 4242;
  child.kill = () => {
    // Simulate the OS reaping the killed process shortly after SIGKILL.
    process.nextTick(() => child.emit("close", null));
  };
  return child;
}

test("createNotRunExecution always reports NOT_RUN and never PASS", () => {
  const execution = createNotRunExecution({
    command: "npm run build",
    workingDirectory: "frontend",
    reason: "Skipped: npm install did not pass.",
  });
  assertWellFormedExecution(execution);
  assert.equal(execution.status, VALIDATION_STATUS.NOT_RUN);
  assert.equal(execution.exitCode, null);
  assert.equal(execution.durationMs, 0);
  assert.equal(execution.stderr, "Skipped: npm install did not pass.");
});

test("executeValidationCommand reports TOOL_UNAVAILABLE when the tool cannot be resolved", async () => {
  const execution = await executeValidationCommand({
    commandName: "npm",
    args: ["install"],
    workingDirectory: "/workspace/repo",
    resolveTool: async () => null,
    spawnProcess: () => {
      throw new Error("spawnProcess must not be called when the tool is unavailable");
    },
  });
  assertWellFormedExecution(execution);
  assert.equal(execution.status, VALIDATION_STATUS.TOOL_UNAVAILABLE);
  assert.equal(execution.exitCode, null);
});

test("executeValidationCommand reports PASS on exit code 0 and captures stdout", async () => {
  const execution = await executeValidationCommand({
    commandName: "npm",
    args: ["test"],
    workingDirectory: "/workspace/repo",
    resolveTool: async () => "/usr/bin/npm",
    spawnProcess: () => {
      const child = createFakeChild();
      process.nextTick(() => {
        child.stdout.emit("data", "5 passed\n");
        child.emit("close", 0);
      });
      return child;
    },
  });
  assertWellFormedExecution(execution);
  assert.equal(execution.status, VALIDATION_STATUS.PASS);
  assert.equal(execution.exitCode, 0);
  assert.match(execution.stdout, /5 passed/);
});

test("executeValidationCommand reports FAIL on a nonzero exit code", async () => {
  const execution = await executeValidationCommand({
    commandName: "mvn",
    args: ["test"],
    workingDirectory: "/workspace/repo/backend",
    resolveTool: async () => "/usr/bin/mvn",
    spawnProcess: () => {
      const child = createFakeChild();
      process.nextTick(() => {
        child.stderr.emit("data", "BUILD FAILURE\n");
        child.emit("close", 1);
      });
      return child;
    },
  });
  assertWellFormedExecution(execution);
  assert.equal(execution.status, VALIDATION_STATUS.FAIL);
  assert.equal(execution.exitCode, 1);
  assert.match(execution.stderr, /BUILD FAILURE/);
});

test("executeValidationCommand reports TIMEOUT and kills a hung process", async () => {
  const execution = await executeValidationCommand({
    commandName: "npm",
    args: ["test"],
    workingDirectory: "/workspace/repo",
    timeoutMs: 15,
    resolveTool: async () => "/usr/bin/npm",
    spawnProcess: () => createFakeChild(), // never closes on its own
  });
  assertWellFormedExecution(execution);
  assert.equal(execution.status, VALIDATION_STATUS.TIMEOUT);
  assert.equal(execution.exitCode, null);
});

test("executeValidationCommand bounds oversized output instead of returning it raw", async () => {
  const hugeChunk = "x".repeat(20_000);
  const execution = await executeValidationCommand({
    commandName: "npm",
    args: ["install"],
    workingDirectory: "/workspace/repo",
    resolveTool: async () => "/usr/bin/npm",
    spawnProcess: () => {
      const child = createFakeChild();
      process.nextTick(() => {
        child.stdout.emit("data", hugeChunk);
        child.emit("close", 0);
      });
      return child;
    },
  });
  assert.ok(execution.stdout.length < hugeChunk.length);
  assert.match(execution.stdout, /OUTPUT TRUNCATED/);
});

test("runValidation never converts a skipped step into PASS when install fails", async () => {
  const calls = [];
  const executeCmd = async ({ commandName, args }) => {
    calls.push(`${commandName} ${args.join(" ")}`);
    if (commandName === "npm" && args[0] === "install") {
      return {
        command: "npm install",
        workingDirectory: "/workspace/repo",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 5,
        exitCode: 1,
        status: VALIDATION_STATUS.FAIL,
        stdout: "",
        stderr: "npm ERR! network timeout",
      };
    }
    throw new Error(`unexpected command invoked: ${commandName} ${args.join(" ")}`);
  };

  const result = await runValidation({
    workspacePath: "/workspace/repo",
    ecosystems: [
      {
        ecosystem: "Node",
        manifest: "package.json",
        status: "EXECUTABLE",
        buildCandidates: ["npm run build"],
        testCandidates: ["npm test"],
      },
    ],
    executeCmd,
  });

  // Only npm install should ever have been invoked; build/test must be
  // recorded as NOT_RUN rather than skipped silently or fabricated as PASS.
  assert.deepEqual(calls, ["npm install --no-audit --no-fund"]);
  assert.equal(result.executions.length, 3);
  const [install, build, testStep] = result.executions;
  assert.equal(install.status, VALIDATION_STATUS.FAIL);
  assert.equal(build.status, VALIDATION_STATUS.NOT_RUN);
  assert.equal(testStep.status, VALIDATION_STATUS.NOT_RUN);
  for (const execution of result.executions) assertWellFormedExecution(execution);

  assert.equal(result.passed, false);
  assert.equal(result.status, VALIDATION_STATUS.FAIL);
  assert.equal(result.summary.notRun, 2);
  assert.equal(result.summary.failed, 1);
});

test("runValidation runs the full Node sequence and reports PASS when every step passes", async () => {
  const calls = [];
  const executeCmd = async ({ commandName, args }) => {
    const command = `${commandName} ${args.join(" ")}`;
    calls.push(command);
    return {
      command,
      workingDirectory: "/workspace/repo",
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: 10,
      exitCode: 0,
      status: VALIDATION_STATUS.PASS,
      stdout: "ok",
      stderr: "",
    };
  };

  const result = await runValidation({
    workspacePath: "/workspace/repo",
    ecosystems: [
      {
        ecosystem: "Node",
        manifest: "package.json",
        status: "EXECUTABLE",
        buildCandidates: ["npm run build"],
        testCandidates: ["npm test"],
      },
    ],
    executeCmd,
  });

  assert.deepEqual(calls, [
    "npm install --no-audit --no-fund",
    "npm run build",
    "npm test",
  ]);
  assert.equal(result.passed, true);
  assert.equal(result.status, VALIDATION_STATUS.PASS);
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.passed, 3);
});

test("runValidation runs mvn test then mvn package -DskipTests for Maven", async () => {
  const calls = [];
  const executeCmd = async ({ commandName, args }) => {
    const command = `${commandName} ${args.join(" ")}`;
    calls.push(command);
    return {
      command,
      workingDirectory: "/workspace/repo/backend",
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: 10,
      exitCode: 0,
      status: VALIDATION_STATUS.PASS,
      stdout: "",
      stderr: "",
    };
  };

  const result = await runValidation({
    workspacePath: "/workspace/repo",
    ecosystems: [
      {
        ecosystem: "Maven",
        manifest: "backend/pom.xml",
        status: "EXECUTABLE",
      },
    ],
    executeCmd,
  });

  assert.deepEqual(calls, ["mvn test", "mvn package -DskipTests"]);
  assert.equal(result.status, VALIDATION_STATUS.PASS);
  assert.equal(result.summary.total, 2);
});

test("runValidation reports NOT_RUN overall when no executable ecosystem is detected", async () => {
  const result = await runValidation({
    workspacePath: "/workspace/repo",
    ecosystems: [
      { ecosystem: "Python", manifest: "requirements.txt", status: "NOT_RUN" },
    ],
    executeCmd: async () => {
      throw new Error("no command should run for a non-executable ecosystem");
    },
  });

  assert.deepEqual(result.executions, []);
  assert.equal(result.passed, false);
  assert.equal(result.status, VALIDATION_STATUS.NOT_RUN);
});
