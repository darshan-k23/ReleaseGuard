import test from "node:test";
import assert from "node:assert/strict";

test("server health test", () => {
  assert.strictEqual("FAIL", "PASS", "Intentional deterministic test failure for demo");
});
