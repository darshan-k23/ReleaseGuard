import Badge from "./Badge.jsx";

function scoreColor(score) {
  if (score >= 85) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

export default function ReadinessScore({ report }) {
  if (!report) return null;
  const { score, status, statusSummary } = report;
  const blockerCount = report.findings?.filter((finding) =>
    finding.status === "OPEN" && ["CRITICAL", "HIGH"].includes(finding.severity),
  ).length ?? report.metrics?.criticalBlockers ?? 0;
  const tone = status === "RELEASE BLOCKED"
    ? "BLOCKER"
    : status === "VALIDATION INCOMPLETE"
      ? "WARNING"
      : "READY FOR REVIEW";
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));

  return (
    <section aria-labelledby="readiness-heading" className={`console-panel console-status-transition flex min-w-0 flex-col overflow-hidden p-5 sm:p-6 ${status === "RELEASE BLOCKED" ? "border-l-4 border-l-red-400" : status === "VALIDATION INCOMPLETE" ? "border-l-4 border-l-amber-300" : "border-l-4 border-l-emerald-400"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        Deterministic demo heuristic
      </p>
      <h2 id="readiness-heading" className="mt-1 text-sm font-semibold text-slate-100">Release readiness</h2>
      <div className={`mt-3 text-6xl font-extrabold leading-none tabular-nums sm:text-7xl ${scoreColor(safeScore)}`} aria-label={`Readiness score ${safeScore} out of 100`}>
        {safeScore}
        <span className="text-2xl font-semibold text-slate-500"> / 100</span>
      </div>
      <div
        role="meter"
        aria-label="Release readiness score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safeScore}
        className="mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface"
      >
        <div
          className={`h-full rounded-full ${safeScore >= 85 ? "bg-emerald-400" : safeScore >= 60 ? "bg-amber-400" : "bg-red-400"}`}
          style={{ width: `${safeScore}%` }}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Badge tone={tone}>{status}</Badge>
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Release gate</span>
      </div>
      <div className="mt-4 flex items-center justify-between border-y border-surface-border py-3">
        <span className="text-xs font-medium text-slate-400">Open release blockers</span>
        <span className={`font-mono text-xl font-bold tabular-nums ${blockerCount ? "text-red-300" : "text-emerald-300"}`}>{blockerCount}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{statusSummary}</p>
      <p className="mt-4 text-[11px] leading-5 text-slate-500">
        {report.scoreMethod
          ? `Score method: ${Object.entries(report.scoreMethod.deductions).map(([severity, deduction]) => `${severity} −${deduction}`).join(" · ")}. Deterministic demo heuristic, not an industry standard.`
          : "Severity-weighted deterministic demo heuristic; not an industry-standard metric."}
      </p>
      {report.scoreMethod?.disclaimer && (
        <p className="mt-2 text-[10px] leading-4 text-slate-600">
          {report.scoreMethod.disclaimer}
        </p>
      )}
    </section>
  );
}
