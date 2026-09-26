import Badge from "./Badge.jsx";

function formatTimestamp(value) {
  if (!value) return "Not run";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Detail({ label, value, mono = false }) {
  return (
    <div className="min-w-0 border-t border-surface-border pt-3 sm:border-t-0 sm:border-l sm:pl-4 sm:first:border-l-0 sm:first:pl-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`mt-1 truncate text-xs text-slate-200 ${mono ? "font-mono" : ""}`} title={value}>
        {value}
      </dd>
    </div>
  );
}

export default function AnalysisHeader({ project, analysis, isAnalyzing, isLoading, onAnalyze }) {
  const checks = analysis?.checks || [];
  const checksExecuted = checks.filter((check) => check.status !== "NOT RUN").length;
  const checkSummary = checks.length ? `${checksExecuted} / ${checks.length} checks` : "No analysis yet";

  return (
    <section className="rounded-xl border border-surface-border bg-surface-card px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Release analysis</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-100">{project?.name || "ShopSphere"}</h2>
            {analysis && <Badge tone={analysis.status === "RELEASE BLOCKED" ? "BLOCKER" : analysis.status === "VALIDATION INCOMPLETE" ? "WARNING" : "READY FOR REVIEW"}>{analysis.status}</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-400">{project?.description || "Fixed repository target: demo-project/"}</p>
        </div>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={!project || isLoading || isAnalyzing}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={isAnalyzing ? "Repository analysis running" : "Analyze repository now"}
        >
          {isAnalyzing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-transparent" aria-hidden="true" /> : <span aria-hidden="true">▶</span>}
          {isAnalyzing ? "Analyzing…" : isLoading ? "Loading…" : analysis ? "Run analysis" : "Analyze repository"}
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        <Detail label="Analysis ID" value={analysis?.analysisId || "Pending"} mono />
        <Detail label="Analyzed at" value={formatTimestamp(analysis?.analyzedAt)} />
        <Detail label="Duration" value={analysis ? `${analysis.durationMs} ms` : "—"} />
        <Detail label="Checks executed" value={checkSummary} />
        <Detail label="Analysis mode" value="Deterministic · local" />
      </dl>
    </section>
  );
}
