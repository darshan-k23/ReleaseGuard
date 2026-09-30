import { useMemo } from "react";
import Badge from "./Badge.jsx";
import { compareAnalysisSummaries } from "../utils/analysisComparison.js";

function formatTimestamp(value) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function ComparisonList({ title, items, emptyText, renderItem }) {
  return (
    <section className="min-w-0">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}<span className="ml-2 font-mono text-slate-600">{items.length}</span></h4>
      {items.length ? (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => <li key={item.id || item.ruleId || item.checkId}>{renderItem(item)}</li>)}
        </ul>
      ) : <p className="mt-2 text-xs text-slate-600">{emptyText}</p>}
    </section>
  );
}

function Timeline({ before, after, bobEvidence }) {
  const events = [
    {
      title: "ReleaseGuard analysis",
      detail: before ? `${formatTimestamp(before.timestamp)} · score ${before.score} · ${before.status}` : "Select a BEFORE run",
      state: before ? "recorded" : "select a run",
    },
    {
      title: "IBM Bob remediation",
      detail: bobEvidence
        ? `Imported session ${bobEvidence.sessionId}: ${bobEvidence.summary}`
        : "Developer-mediated step · no Bob session evidence imported",
      state: bobEvidence ? "evidence imported" : "manual handoff",
    },
    {
      title: "ReleaseGuard validation",
      detail: after ? `${formatTimestamp(after.timestamp)} · score ${after.score} · ${after.status}` : "Select an AFTER run",
      state: after ? "recorded" : "select a run",
    },
  ];

  return (
    <ol aria-label="Release analysis, IBM Bob remediation, and validation timeline" className="grid gap-3 lg:grid-cols-3">
      {events.map((event, index) => (
        <li key={event.title} className="relative min-w-0 rounded-md border border-surface-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-300/30 font-mono text-[10px] text-cyan-200">{index + 1}</span>
            <h4 className="text-xs font-semibold text-slate-200">{event.title}</h4>
          </div>
          <p className="mt-2 break-words text-[11px] leading-5 text-slate-400">{event.detail}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-600">{event.state}</p>
        </li>
      ))}
    </ol>
  );
}

export default function AnalysisHistory({
  history,
  beforeAnalysisId,
  afterAnalysisId,
  onSelectBefore,
  onSelectAfter,
  bobEvidence,
}) {
  const before = history.find((run) => run.analysisId === beforeAnalysisId) || null;
  const after = history.find((run) => run.analysisId === afterAnalysisId) || null;
  const comparison = useMemo(
    () => compareAnalysisSummaries(before, after),
    [before, after],
  );

  function shortId(analysisId) {
    return analysisId.length > 18 ? `${analysisId.slice(0, 8)}…${analysisId.slice(-6)}` : analysisId;
  }

  return (
    <section aria-labelledby="analysis-history-heading" className="rounded-xl border border-surface-border bg-surface-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Local summary history</p>
          <h2 id="analysis-history-heading" className="mt-1 text-sm font-semibold text-slate-100">Before / after release analysis</h2>
          <p className="mt-1 text-xs text-slate-500">Last {history.length} runs · summary metadata only · stored in this browser</p>
        </div>
        <Badge tone="NOT RUN">Full analyses are not persisted</Badge>
      </div>

      {history.length ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              BEFORE
              <select aria-label="Before analysis" value={beforeAnalysisId || ""} onChange={(event) => onSelectBefore(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-xs font-normal normal-case tracking-normal text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                {history.map((run) => <option key={run.analysisId} value={run.analysisId}>{formatTimestamp(run.timestamp)} · {shortId(run.analysisId)}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              AFTER
              <select aria-label="After analysis" value={afterAnalysisId || ""} onChange={(event) => onSelectAfter(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-xs font-normal normal-case tracking-normal text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                {history.map((run) => <option key={run.analysisId} value={run.analysisId}>{formatTimestamp(run.timestamp)} · {shortId(run.analysisId)}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-surface-border">
            <table className="w-full min-w-[42rem] border-collapse text-left text-xs">
              <thead className="bg-surface text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-3 py-2 font-medium">Timestamp</th><th className="px-3 py-2 font-medium">Score</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Blockers</th><th className="px-3 py-2 font-medium">Analysis ID</th><th className="px-3 py-2 font-medium">Select</th></tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {history.map((run) => (
                  <tr key={run.analysisId} className="text-slate-300">
                    <td className="whitespace-nowrap px-3 py-2">{formatTimestamp(run.timestamp)}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{run.score}</td>
                    <td className="px-3 py-2"><Badge tone={run.status === "RELEASE BLOCKED" ? "BLOCKER" : run.status === "VALIDATION INCOMPLETE" ? "WARNING" : "READY FOR REVIEW"}>{run.status}</Badge></td>
                    <td className="px-3 py-2 font-mono tabular-nums">{run.blockerCount}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-500" title={run.analysisId}>{shortId(run.analysisId)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <button type="button" aria-label={`Use ${shortId(run.analysisId)} as before analysis`} aria-pressed={run.analysisId === beforeAnalysisId} onClick={() => onSelectBefore(run.analysisId)} className="rounded px-1.5 py-1 text-[10px] text-slate-400 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">Before</button>
                      <button type="button" aria-label={`Use ${shortId(run.analysisId)} as after analysis`} aria-pressed={run.analysisId === afterAnalysisId} onClick={() => onSelectAfter(run.analysisId)} className="ml-1 rounded px-1.5 py-1 text-[10px] text-slate-400 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">After</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {comparison ? (
            <div className="mt-4 space-y-4" aria-label="Selected before and after comparison">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-surface-border bg-surface p-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Score</p>
                  <p className="mt-1 text-sm text-slate-300">Before: <span className="font-mono font-semibold text-slate-100">{before.score}</span></p>
                  <p className="mt-1 text-sm text-slate-300">After: <span className="font-mono font-semibold text-slate-100">{after.score}</span></p>
                </div>
                <div className="rounded-md border border-surface-border bg-surface p-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Score delta</p>
                  <p className={`mt-1 font-mono text-lg font-semibold ${comparison.scoreDelta > 0 ? "text-emerald-300" : comparison.scoreDelta < 0 ? "text-red-300" : "text-slate-200"}`}>
                    {comparison.scoreDelta > 0 ? `+${comparison.scoreDelta}` : comparison.scoreDelta}
                  </p>
                </div>
                <div className="rounded-md border border-surface-border bg-surface p-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Release status delta</p>
                  <p className="mt-1 text-xs text-slate-300">{before.status}</p>
                  <p className="mt-1 text-xs text-slate-300">{comparison.statusChanged ? `Changed to ${after.status}` : `Unchanged · ${after.status}`}</p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <ComparisonList title="Resolved findings" items={comparison.resolvedFindings} emptyText="No findings resolved between these runs." renderItem={(finding) => <span className="text-xs text-emerald-200">{finding.ruleId} · {finding.title}</span>} />
                <ComparisonList title="New findings" items={comparison.newFindings} emptyText="No new findings in the selected AFTER run." renderItem={(finding) => <span className="text-xs text-amber-200">{finding.ruleId} · {finding.title}</span>} />
                <ComparisonList title="Remaining blockers" items={comparison.remainingBlockers} emptyText="No blockers remain in the selected AFTER run." renderItem={(finding) => <span className="text-xs text-red-200">{finding.ruleId} · {finding.title}</span>} />
                <ComparisonList title="Changed check states" items={comparison.changedChecks} emptyText="No check states changed between these runs." renderItem={(check) => <span className="text-xs text-slate-300">{check.id} · {check.beforeStatus} → {check.afterStatus}</span>} />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-500">Choose BEFORE and AFTER analyses to compare release outcomes.</p>
          )}

          <div className="mt-5 border-t border-surface-border pt-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-300">Release workflow timeline</h3>
            <Timeline before={before} after={after} bobEvidence={bobEvidence} />
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-surface-border px-4 py-6 text-center text-xs text-slate-500">No saved analysis summaries yet. Run ReleaseGuard to start local history.</p>
      )}
    </section>
  );
}
