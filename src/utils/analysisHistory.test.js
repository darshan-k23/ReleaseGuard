import assert from "node:assert/strict";
import test from "node:test";
import { compareAnalysisSummaries } from "./analysisComparison.js";
import {
  ANALYSIS_HISTORY_KEY,
  MAX_ANALYSIS_HISTORY,
  readAnalysisHistory,
  saveAnalysisSummary,
  summarizeAnalysis,
} from "./analysisHistory.js";

function memoryStorage(initial = "[]") {
  let value = initial;
  return {
    getItem(key) {
      assert.equal(key, ANALYSIS_HISTORY_KEY);
      return value;
    },
    setItem(key, next) {
      assert.equal(key, ANALYSIS_HISTORY_KEY);
      value = next;
    },
    read() {
      return value;
    },
  };
}

function analysis(index) {
  return {
    analysisId: `analysis-${index}`,
    analyzedAt: `2026-09-${String(index).padStart(2, "0")}T00:00:00.000Z`,
    score: 90 - index,
    status: "RELEASE BLOCKED",
    project: { name: "ShopSphere" },
    findings: [
      {
        id: "SEC-01:fingerprint",
        ruleId: "SEC-01",
        title: "Fake secret finding",
        category: "Security",
        severity: "LOW",
        status: "OPEN",
        evidence: "password=do-not-persist",
        affectedFile: "private/path.properties",
      },
    ],
    checks: [{ id: "test", category: "Tests", status: "FAIL", stdout: "do-not-persist" }],
    releasePlan: [{ title: "do-not-persist" }],
  };
}

test("stores only summary metadata and compact finding/check identities", () => {
  const summary = summarizeAnalysis(analysis(1));
  assert.deepEqual(Object.keys(summary), [
    "analysisId", "timestamp", "score", "status", "blockerCount",
    "warningCount", "projectName", "findings", "checks",
  ]);
  assert.equal(summary.warningCount, 1);
  assert.equal(summary.findings[0].id, "SEC-01:fingerprint");
  assert.equal("evidence" in summary.findings[0], false);
  assert.equal("affectedFile" in summary.findings[0], false);
  assert.equal("stdout" in summary.checks[0], false);
  assert.equal(JSON.stringify(summary).includes("do-not-persist"), false);
  assert.equal(JSON.stringify(summary).includes("private/path"), false);
});

test("deduplicates analysis IDs and keeps only the latest ten runs", () => {
  const storage = memoryStorage();
  for (let index = 1; index <= MAX_ANALYSIS_HISTORY + 2; index += 1) {
    saveAnalysisSummary(analysis(index), storage);
  }
  const history = readAnalysisHistory(storage);
  assert.equal(history.length, MAX_ANALYSIS_HISTORY);
  assert.equal(history[0].analysisId, "analysis-12");
  assert.equal(history.at(-1).analysisId, "analysis-3");

  saveAnalysisSummary(analysis(12), storage);
  assert.equal(readAnalysisHistory(storage).filter((entry) => entry.analysisId === "analysis-12").length, 1);
});

test("corrupt localStorage contents fail closed to an empty history", () => {
  assert.deepEqual(readAnalysisHistory(memoryStorage("not json")), []);
});

test("comparison tracks a removed stable finding and changed check state", () => {
  const before = {
    analysisId: "before",
    score: 48,
    status: "RELEASE BLOCKED",
    findings: [
      { id: "SEC-01:stable", ruleId: "SEC-01", title: "Synthetic marker", severity: "LOW", status: "OPEN" },
      { id: "INT-01:stable", ruleId: "INT-01", title: "Port mismatch", severity: "HIGH", status: "OPEN" },
    ],
    checks: [{ id: "test", category: "Tests", status: "FAIL" }],
  };
  const after = {
    analysisId: "after",
    score: 50,
    status: "RELEASE BLOCKED",
    findings: [before.findings[1]],
    checks: [{ id: "test", category: "Tests", status: "PASS" }],
  };
  const comparison = compareAnalysisSummaries(before, after);

  assert.equal(comparison.scoreDelta, 2);
  assert.equal(comparison.statusChanged, false);
  assert.deepEqual(comparison.resolvedFindings.map((finding) => finding.ruleId), ["SEC-01"]);
  assert.deepEqual(comparison.remainingBlockers.map((finding) => finding.ruleId), ["INT-01"]);
  assert.deepEqual(comparison.changedChecks.map((check) => [check.beforeStatus, check.afterStatus]), [["FAIL", "PASS"]]);
});
