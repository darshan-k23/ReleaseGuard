import assert from "node:assert/strict";
import test from "node:test";
import { executeReanalysis } from "./reanalysis.js";
import { compareAnalysisSummaries } from "./analysisComparison.js";

test("Re-run with currentJob.jobId calls analyzeJob(jobId) and does NOT call runAnalysis", async () => {
  let validateCalledWith = null;
  let analyzeCalledWith = null;
  let runAnalysisCalled = false;

  const currentJob = {
    jobId: "job-sec-123",
    repositoryName: "security-blocked",
    repositoryUrl: "https://github.com/releaseguard-demo/security-blocked",
  };

  const fakeAnalysisResult = {
    analysisId: "analysis-sec-456",
    status: "RELEASE BLOCKED",
    score: 80,
    repository: { name: "security-blocked", description: "Security demo repository" },
    findings: [
      { id: "SEC-01", ruleId: "SEC-HARDCODED-CREDENTIAL", severity: "HIGH", status: "OPEN" },
    ],
  };

  const { result, project, isJobScoped, jobId } = await executeReanalysis({
    currentJob,
    analysis: null,
    validateJobFn: async (id) => {
      validateCalledWith = id;
      return { validation: { build: { status: "PASS" }, tests: { status: "PASS" } } };
    },
    analyzeJobFn: async (id) => {
      analyzeCalledWith = id;
      return fakeAnalysisResult;
    },
    runAnalysisFn: async () => {
      runAnalysisCalled = true;
      return { project: { name: "ShopSphere" } };
    },
  });

  assert.equal(validateCalledWith, "job-sec-123");
  assert.equal(analyzeCalledWith, "job-sec-123");
  assert.equal(runAnalysisCalled, false);
  assert.equal(isJobScoped, true);
  assert.equal(jobId, "job-sec-123");
  assert.equal(project.name, "security-blocked");
  assert.equal(result.repository.name, "security-blocked");
  assert.notEqual(project.name, "ShopSphere");
});

test("Re-run with analysis.job.jobId when currentJob is absent calls analyzeJob(jobId)", async () => {
  let analyzeCalledWith = null;
  let runAnalysisCalled = false;

  const analysis = {
    analysisId: "analysis-gh-101",
    job: { jobId: "job-gh-999" },
    repository: { name: "octocat/Hello-World" },
    findings: [],
  };

  const fakeJobResult = {
    analysisId: "analysis-gh-102",
    status: "READY FOR REVIEW",
    score: 100,
    repository: { name: "octocat/Hello-World", description: "GitHub repository" },
    findings: [],
  };

  const { result, project, isJobScoped, jobId } = await executeReanalysis({
    currentJob: null,
    analysis,
    validateJobFn: async () => ({ validation: {} }),
    analyzeJobFn: async (id) => {
      analyzeCalledWith = id;
      return fakeJobResult;
    },
    runAnalysisFn: async () => {
      runAnalysisCalled = true;
      return { project: { name: "ShopSphere" } };
    },
  });

  assert.equal(analyzeCalledWith, "job-gh-999");
  assert.equal(runAnalysisCalled, false);
  assert.equal(isJobScoped, true);
  assert.equal(jobId, "job-gh-999");
  assert.equal(project.name, "octocat/Hello-World");
  assert.equal(result.repository.name, "octocat/Hello-World");
});

test("Re-run falls back to runAnalysis only when no active jobId is present", async () => {
  let runAnalysisCalled = false;

  const { result, project, isJobScoped, jobId } = await executeReanalysis({
    currentJob: null,
    analysis: null,
    runAnalysisFn: async () => {
      runAnalysisCalled = true;
      return {
        analysisId: "legacy-analysis-1",
        project: { name: "Repository", description: "Default workspace" },
      };
    },
  });

  assert.equal(runAnalysisCalled, true);
  assert.equal(isJobScoped, false);
  assert.equal(jobId, null);
  assert.equal(project.name, "Repository");
  assert.equal(result.analysisId, "legacy-analysis-1");
});

test("Before/after comparison preserves the same repository identity during re-analysis", () => {
  const previousAnalysis = {
    analysisId: "before-1",
    status: "RELEASE BLOCKED",
    score: 80,
    projectName: "security-blocked",
    findings: [
      { id: "SEC-01", ruleId: "SEC-HARDCODED-CREDENTIAL", severity: "HIGH", status: "OPEN" },
      { id: "SEC-02", ruleId: "SEC-DEBUG-LOGGING", severity: "MEDIUM", status: "OPEN" },
    ],
    checks: [{ id: "test", category: "Tests", status: "PASS" }],
  };

  const reanalyzedSameRepo = {
    analysisId: "after-1",
    status: "READY FOR REVIEW",
    score: 95,
    projectName: "security-blocked",
    findings: [
      { id: "SEC-02", ruleId: "SEC-DEBUG-LOGGING", severity: "MEDIUM", status: "OPEN" },
    ],
    checks: [{ id: "test", category: "Tests", status: "PASS" }],
  };

  const comparison = compareAnalysisSummaries(previousAnalysis, reanalyzedSameRepo);

  assert.equal(comparison.scoreDelta, 15);
  assert.equal(comparison.statusChanged, true);
  assert.deepEqual(comparison.resolvedFindings.map((f) => f.ruleId), ["SEC-HARDCODED-CREDENTIAL"]);
  assert.deepEqual(comparison.remainingBlockers, []);
});

test("Tolerates validation failure during job re-analysis", async () => {
  let analyzeCalled = false;

  const currentJob = { jobId: "job-failing-validation" };
  const { result, validation } = await executeReanalysis({
    currentJob,
    validateJobFn: async () => {
      throw new Error("Validation script timed out");
    },
    analyzeJobFn: async (id) => {
      analyzeCalled = true;
      return {
        analysisId: "analysis-val-fail",
        repository: { name: "test-failing" },
      };
    },
  });

  assert.equal(analyzeCalled, true);
  assert.equal(validation, null);
  assert.equal(result.analysisId, "analysis-val-fail");
});
