import { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import AnalysisHeader from "./components/AnalysisHeader.jsx";
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
import { getLatestAnalysis, getProject, runAnalysis } from "./api/client.js";

export default function App() {
  const [project, setProject] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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
      const [projectData, latestAnalysis] = await Promise.all([
        getProject(),
        getLatestAnalysis(),
      ]);
      setProject(projectData);
      setAnalysis(latestAnalysis);
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

  async function handleAnalyze({ captureComparison = false } = {}) {
    setIsAnalyzing(true);
    setError(null);
    setAnalysisCompleted(false);
    try {
      const previousAnalysis = analysis;
      const result = await runAnalysis();
      setProject(result.project);
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

  const unrunChecks = analysis?.checks.filter((check) => check.status === "NOT RUN") || [];

  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="mx-auto max-w-[1440px] space-y-5 px-3 py-4 sm:px-5 sm:py-6 lg:px-7">
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
            Walking the fixed ShopSphere repository and running allowlisted checks…
          </div>
        )}

        {analysisCompleted && analysis && (
          <div role="status" aria-live="polite" className="console-status-transition rounded-md border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-xs text-emerald-200">
            Analysis completed · {analysis.findings.length} findings · {analysis.durationMs} ms
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
            <div className="grid gap-4 xl:grid-cols-[minmax(15rem,0.8fr)_minmax(0,2.2fr)]">
              <ReadinessScore report={analysis} />
              <CategoryGrid categories={analysis.categories} findings={analysis.findings} />
            </div>

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
              Run an analysis to inspect the checked-in ShopSphere repository and evaluate its release gate.
            </p>
          </div>
        )}
      </main>

      <IssueModal issue={selectedIssue} onClose={() => setSelectedIssue(null)} />

      <footer className="mx-auto max-w-[1440px] px-3 pb-6 pt-3 text-[11px] text-slate-600 sm:px-5 lg:px-7">
        ReleaseGuard · deterministic repository evidence and local validation
      </footer>
    </div>
  );
}
