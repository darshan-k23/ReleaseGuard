import Badge from "./Badge.jsx";

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export default function IssuesList({ issues, onSelect }) {
  if (!issues?.length) return null;
  const blockers = issues
    .filter((issue) => ["CRITICAL", "HIGH"].includes(issue.severity))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const warnings = issues
    .filter((issue) => !["CRITICAL", "HIGH"].includes(issue.severity))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const renderIssue = (issue) => (
    <li key={issue.id}>
      <button
        onClick={() => onSelect(issue)}
        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-3 text-left transition hover:bg-white/5"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-200">{issue.title}</p>
          <p className="truncate text-xs text-slate-500">
            {issue.category} · {issue.affectedFile}
          </p>
        </div>
        <Badge tone={issue.severity}>{issue.severity}</Badge>
      </button>
    </li>
  );

  return (
    <section className="min-w-0 rounded-lg border border-surface-border bg-surface-card p-5">
      <h2 className="text-sm font-semibold text-slate-200">
        Blockers &amp; Warnings
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        {issues.length} findings · select one for details
      </p>
      <div className="mt-4">
        <div className="flex items-center justify-between border-b border-surface-border pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-red-300">Release blockers</h3>
          <span className="text-xs tabular-nums text-slate-500">{blockers.length}</span>
        </div>
        {blockers.length ? (
          <ul className="divide-y divide-surface-border">{blockers.map(renderIssue)}</ul>
        ) : (
          <p className="py-3 text-sm text-slate-500">No release blockers found.</p>
        )}
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between border-b border-surface-border pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-300">Warnings</h3>
          <span className="text-xs tabular-nums text-slate-500">{warnings.length}</span>
        </div>
        {warnings.length ? (
          <ul className="divide-y divide-surface-border">{warnings.map(renderIssue)}</ul>
        ) : (
          <p className="py-3 text-sm text-slate-500">No warnings found.</p>
        )}
      </div>
    </section>
  );
}
