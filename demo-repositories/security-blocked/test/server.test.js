import test from "node:test";
import assert from "node:assert/strict";
import server from "../src/server.js";

test("server module exports valid server", () => {
  assert.ok(server);
});
