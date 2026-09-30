import { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import RepositoryEntry from "./components/RepositoryEntry.jsx";
import AnalysisHeader from "./components/AnalysisHeader.jsx";
import BeforeAfterView from "./components/BeforeAfterView.jsx";
import ReadinessScore from "./components/ReadinessScore.jsx";
import CategoryGrid from "./components/CategoryGrid.jsx";
import IssueModal from "./components/IssueModal.jsx";
import ReleaseGate from "./components/ReleaseGate.jsx";
import ReleasePlan from "./components/ReleasePlan.jsx";
import MetricsBar from "./components/MetricsBar.jsx";
import FindingsExplorer from "./components/FindingsExplorer.jsx";
import ValidationChecks from "./components/ValidationChecks.jsx";
import IBMWorkflow from "./components/IBMWorkflow.jsx";
import AnalysisHistory from "./components/AnalysisHistory.jsx";
import { readAnalysisHistory, saveAnalysisSummary } from "./utils/analysisHistory.js";
import { executeReanalysis } from "./utils/reanalysis.js";
import {
  getLatestAnalysis,
  getProject,
  runAnalysis,
  getDemoRepositories,
  createJob,
  getJob,
  getJobStack,
  validateJob,
  analyzeJob,
  createRemediationPlan,
  applyRemediation,
} from "./api/client.js";

export default function App() {
  const [project, setProject] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [currentJob, setCurrentJob] = useState(null);
  const [demoRepositories, setDemoRepositories] = useState([]);
  const [pipelineState, setPipelineState] = useState("idle");
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRemediating, setIsRemediating] = useState(false);
  const [remediationData, setRemediationData] = useState(null);
  const [remediationResult, setRemediationResult] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analysisCompleted, setAnalysisCompleted] = useState(false);
  const [analysisComparison, setAnalysisComparison] = useState(null);
  const [analysisHistory, setAnalysisHistory] = useState(() => readAnalysisHistory());
  const [beforeAnalysisId, setBeforeAnalysisId] = useState("");
  const [afterAnalysisId, setAfterAnalysisId] = useState("");
  const [bobEvidenceSummary, setBobEvidenceSummary] = useState(null);

  async function loadDashboard() {
    setIsLoading(true);
    setError(null);
    try {
      const [projectData, latestAnalysis, demos] = await Promise.all([
        getProject().catch(() => null),
        getLatestAnalysis().catch(() => null),
        getDemoRepositories().catch(() => []),
      ]);

      if (projectData) setProject(projectData);
      if (latestAnalysis) setAnalysis(latestAnalysis);
      if (Array.isArray(demos) && demos.length > 0) {
        setDemoRepositories(demos);
      } else {
        setDemoRepositories([
          { id: "ShopSphere", name: "ShopSphere (Baseline)", description: "ShopSphere sample baseline" },
          { id: "release-ready", name: "release-ready", description: "Clean verified release candidate" },
          { id: "warning-only", name: "warning-only", description: "Missing deployment docs & unlocked ranges" },
          { id: "configuration-risk", name: "configuration-risk", description: "Port mismatch & missing production profile" },
          { id: "security-blocked", name: "security-blocked", description: "Synthetic secret & DEBUG logging" },
          { id: "test-failing", name: "test-failing", description: "Deterministic test failure" },
          { id: "critically-blocked", name: "critically-blocked", description: "Compound blockers across categories" },
        ]);
      }

      const storedHistory = latestAnalysis
        ? saveAnalysisSummary(latestAnalysis)
        : readAnalysisHistory();
      setAnalysisHistory(storedHistory);
      const currentId = latestAnalysis?.analysisId || storedHistory[0]?.analysisId || "";
      const priorId = storedHistory.find((run) => run.analysisId !== currentId)?.analysisId || currentId;
      setAfterAnalysisId(currentId);
      setBeforeAnalysisId(priorId);
    } catch (exception) {
      setError({ kind: "backend", message: exception.message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function handleAnalyzeRepository({ repositoryUrl, demoName, branch = "main" }) {
    setIsAnalyzing(true);
    setError(null);
    setAnalysisCompleted(false);
    setRemediationData(null);
    setRemediationResult(null);
    setPipelineState("cloning");
    setPipelineMessage("Initializing workspace and preparing repository…");

    try {
      const jobInit = await createJob({ repositoryUrl, demoName, branch });
      const jobId = jobInit.jobId;

      let job = await getJob(jobId);
      let attempts = 0;
      while (job.status === "CREATED" || job.status === "CLONING") {
        if (attempts > 60) throw new Error("Repository clone timed out.");
        await new Promise((r) => setTimeout(r, 600));
        job = await getJob(jobId);
        attempts++;
      }

      if (job.status === "FAILED") {
        throw new Error(job.error || "Repository clone failed.");
      }

      setCurrentJob(job);

      setPipelineState("detecting_stack");
      setPipelineMessage("Detecting project stack and ecosystem manifests…");
      const stackData = await getJobStack(jobId).catch(() => ({ ecosystems: [] }));
      job.stack = stackData.ecosystems || stackData.stack || [];
      setCurrentJob({ ...job });

      setPipelineState("validating");
      setPipelineMessage("Running automated build and test validation…");
      const valData = await validateJob(jobId).catch(() => null);
      if (valData?.validation) {
        job.validation = valData.validation;
        setCurrentJob({ ...job });
      }

      setPipelineState("analyzing");
      setPipelineMessage("Running deterministic static inspection and structured LLM assessment…");
      const analysisResult = await analyzeJob(jobId);

      setProject({
        name: analysisResult.repository?.name || job.repositoryName || "Repository",
        description: analysisResult.repository?.description || "Analyzed repository",
      });
      setAnalysis(analysisResult);

      const nextHistory = saveAnalysisSummary(analysisResult);
      setAnalysisHistory(nextHistory);
      const currentId = analysisResult.analysisId || analysisResult.job?.jobId;
      setAfterAnalysisId(currentId);
      setPipelineState("completed");
      setAnalysisCompleted(true);
    } catch (err) {
      setPipelineState("error");
      setError({ kind: "analysis", message: err.message });
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleGenerateRemediation(findingId) {
    if (!currentJob?.jobId && !analysis) return;
    setIsRemediating(true);
    setError(null);
    try {
      const jobId = currentJob?.jobId || "current";
      const targetFinding = analysis?.findings?.find((f) => f.id === findingId) || analysis?.findings?.[0];
      const plan = await createRemediationPlan(jobId, findingId || targetFinding?.id);
      setRemediationData(plan);
    } catch (err) {
      setError({ kind: "analysis", message: err.message });
    } finally {
      setIsRemediating(false);
    }
  }

  async function handleApplyRemediation(findingId) {
    setIsRemediating(true);
    setError(null);
    try {
      if (currentJob?.jobId) {
        let candidate = remediationData;
        if (!candidate || candidate.findingId !== findingId) {
          candidate = await createRemediationPlan(currentJob.jobId, findingId);
          setRemediationData(candidate);
        }
        const result = await applyRemediation(currentJob.jobId, candidate.remediationId);
        setRemediationResult(result);
        if (result.after?.analysis) {
          setAnalysis(result.after.analysis);
          const nextHistory = saveAnalysisSummary(result.after.analysis);
          setAnalysisHistory(nextHistory);
        }
      } else {
        await handleAnalyze({ captureComparison: true });
      }
    } catch (err) {
      setError({ kind: "analysis", message: err.message });
    } finally {
      setIsRemediating(false);
    }
  }

  async function handleAnalyze({ captureComparison = false } = {}) {
    setIsAnalyzing(true);
    setError(null);
    setAnalysisCompleted(false);
    try {
      const previousAnalysis = analysis;
      const { result, project: nextProject, validation: valData } = await executeReanalysis({
        currentJob,
        analysis,
        validateJobFn: validateJob,
        analyzeJobFn: analyzeJob,
        runAnalysisFn: runAnalysis,
      });

      if (valData && currentJob) {
        currentJob.validation = valData;
        setCurrentJob({ ...currentJob });
      }

      setProject(nextProject);
      setAnalysis(result);
      const nextHistory = saveAnalysisSummary(result);
      setAnalysisHistory(nextHistory);
      const previousSummaryId = previousAnalysis?.analysisId
        || nextHistory.find((run) => run.analysisId !== result.analysisId)?.analysisId
        || result.analysisId;
      setBeforeAnalysisId(previousSummaryId);
      setAfterAnalysisId(result.analysisId);
      setAnalysisComparison(
        captureComparison && previousAnalysis
          ? { before: previousAnalysis, after: result }
          : null,
      );
      setAnalysisCompleted(true);
    } catch (exception) {
      setError({ kind: "analysis", message: exception.message });
    } finally {
      setIsAnalyzing(false);
    }
  }

  const unrunChecks = analysis?.checks?.filter((check) => check.status === "NOT RUN") || [];

  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="mx-auto max-w-[1440px] space-y-5 px-3 py-4 sm:px-5 sm:py-6 lg:px-7">
        {/* Repository Gateway Entry */}
        <RepositoryEntry
          demoRepositories={demoRepositories}
          onAnalyzeRepository={handleAnalyzeRepository}
          currentJob={currentJob}
          currentAnalysis={analysis}
          pipelineState={pipelineState}
          pipelineMessage={pipelineMessage}
        />

        <AnalysisHeader
          project={project}
          analysis={analysis}
          isAnalyzing={isAnalyzing}
          isLoading={isLoading}
          onAnalyze={handleAnalyze}
        />

        {error && (
          <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{error.kind === "backend" ? "Backend unavailable" : "Analysis error"}</p>
              <p className="mt-1 text-red-200/80">
                {error.kind === "backend"
                  ? "ReleaseGuard could not reach its local API. Start the backend and retry."
                  : error.message || "The repository analysis did not complete."}
              </p>
            </div>
            <button
              type="button"
              onClick={error.kind === "backend" ? loadDashboard : handleAnalyze}
              disabled={isLoading || isAnalyzing}
              className="min-h-10 shrink-0 rounded-md border border-red-400/30 px-3 py-2 font-medium text-red-100 transition hover:bg-red-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300 disabled:opacity-50"
            >
              {isLoading ? "Connecting…" : error.kind === "backend" ? "Retry connection" : "Retry analysis"}
            </button>
          </div>
        )}

        {isLoading && (
          <div role="status" aria-live="polite" className="space-y-3 rounded-xl border border-surface-border bg-surface-card p-5">
            <div className="h-4 w-44 animate-pulse rounded bg-slate-700/60" />
            <div className="h-3 w-72 max-w-full animate-pulse rounded bg-slate-800" />
            <p className="text-xs text-slate-500">Loading project analysis…</p>
          </div>
        )}

        {isAnalyzing && (
          <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-100">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-200" aria-hidden="true" />
            Walking repository, executing validation, and assembling LLM assessment…
          </div>
        )}

        {analysisCompleted && analysis && (
          <div role="status" aria-live="polite" className="console-status-transition rounded-md border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-xs text-emerald-200">
            Analysis completed · {analysis.findings?.length || 0} findings · {analysis.durationMs || 0} ms
          </div>
        )}

        {analysis && (
          <>
            <p className="text-xs text-slate-500">
              Deterministic local checks <span className="px-1 text-slate-700">/</span> No live vulnerability database
            </p>
            {unrunChecks.length > 0 && (
              <div role="status" className="rounded-md border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs text-amber-100">
                Partial check execution · {unrunChecks.length} check(s) were not run. Unavailable tools and timeouts are not treated as passes.
              </div>
            )}

            {/* Readiness Score & Category Grid */}
            <div className="grid gap-4 xl:grid-cols-[minmax(15rem,0.8fr)_minmax(0,2.2fr)]">
              <ReadinessScore report={analysis} />
              <CategoryGrid categories={analysis.categories} findings={analysis.findings} />
            </div>

            {/* Professional Before / After Remediation View */}
            <BeforeAfterView
              beforeData={remediationResult?.before || analysisComparison?.before || analysis}
              remediationData={remediationData || remediationResult}
              afterData={remediationResult?.after || analysisComparison?.after || (remediationResult ? remediationResult : null)}
              onGenerateRemediation={handleGenerateRemediation}
              onApplyRemediation={handleApplyRemediation}
              isRemediating={isRemediating}
              availableFindings={analysis.findings || []}
            />

            <MetricsBar metrics={analysis.metrics} />
            <ReleaseGate analysis={analysis} onSelect={setSelectedIssue} />

            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.8fr)]">
              <FindingsExplorer findings={analysis.findings} onSelect={setSelectedIssue} />
              <ReleasePlan plan={analysis.releasePlan} />
            </div>

            <ValidationChecks checks={analysis.checks} />
            <IBMWorkflow
              analysis={analysis}
              isAnalyzing={isAnalyzing}
              comparison={analysisComparison}
              onEvidenceImported={setBobEvidenceSummary}
              onReanalyze={() => handleAnalyze({ captureComparison: true })}
            />
          </>
        )}

        {!isLoading && (
          <AnalysisHistory
            history={analysisHistory}
            beforeAnalysisId={beforeAnalysisId}
            afterAnalysisId={afterAnalysisId}
            onSelectBefore={setBeforeAnalysisId}
            onSelectAfter={setAfterAnalysisId}
            bobEvidence={bobEvidenceSummary}
          />
        )}

        {!isLoading && !analysis && !error && (
          <div className="rounded-xl border border-surface-border bg-surface-card px-5 py-12 text-center">
            <h2 className="text-base font-semibold text-slate-200">No analysis available</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
              Select a demo repository above or enter a GitHub repository URL to evaluate its release gate.
            </p>
          </div>
        )}
      </main>

      <IssueModal issue={selectedIssue} onClose={() => setSelectedIssue(null)} />

      <footer className="mx-auto max-w-[1440px] px-3 pb-6 pt-3 text-[11px] text-slate-600 sm:px-5 lg:px-7">
        ReleaseGuard · deterministic repository evidence, isolated remediation workspaces, and local validation
      </footer>
    </div>
  );
}
