import Badge from "./Badge.jsx";

function FindingGroup({ title, tone, items, emptyText, onSelect }) {
  const groupStyle = title === "Must fix before release"
    ? "border-t-2 border-t-red-400/70"
    : title === "Should fix"
      ? "border-t-2 border-t-amber-300/60"
      : title === "Clean / verified"
        ? "border-t-2 border-t-emerald-400/50"
        : "border-t-2 border-t-slate-500/50";
  return (
    <section className={`min-w-0 rounded-md border border-surface-border bg-surface/70 p-3 ${groupStyle}`}>
      <div className="flex items-center justify-between gap-2 border-b border-surface-border pb-2">
        <h3 className={`text-[11px] font-semibold uppercase tracking-wider ${title === "Must fix before release" ? "text-red-200" : title === "Should fix" ? "text-amber-200" : title === "Clean / verified" ? "text-emerald-200" : "text-slate-400"}`}>{title}</h3>
        <span className="font-mono text-xs tabular-nums text-slate-400">{items.length}</span>
      </div>
      {items.length ? (
        <ul className="mt-1 divide-y divide-surface-border">
          {items.map((item) => (
            <li key={item.id || item.name}>
              {item.affectedFile && item.ruleId ? (
                <button type="button" onClick={() => onSelect(item)} className="console-panel-interactive w-full rounded px-2 py-2 text-left hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-200"><span>{item.title}</span><Badge tone={tone}>{item.severity || item.status}</Badge></span>
                  <span className="mt-1 block break-all font-mono text-[10px] leading-4 text-slate-500">{item.affectedFile}:{item.startLine}</span>
                </button>
              ) : (
                <div className="px-2 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-200">{item.name || item.id}</p>
                    <Badge tone={item.status}>{item.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.summary}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="py-3 text-xs text-slate-600">{emptyText}</p>}
    </section>
  );
}

export default function ReleaseGate({ analysis, onSelect }) {
  const open = analysis.findings.filter((finding) => finding.status === "OPEN");
  const mustFix = open.filter((finding) => ["CRITICAL", "HIGH"].includes(finding.severity));
  const shouldFix = open.filter((finding) => ["MEDIUM", "LOW"].includes(finding.severity));
  const clean = analysis.categories.filter((category) => category.status === "PASS");
  const notRun = analysis.checks.filter((check) => check.status === "NOT RUN");

  return (
    <section aria-labelledby="release-gate-heading" className={`console-panel console-status-transition p-4 sm:p-5 ${analysis.status === "RELEASE BLOCKED" ? "border-l-4 border-l-red-400" : analysis.status === "VALIDATION INCOMPLETE" ? "border-l-4 border-l-amber-300" : "border-l-4 border-l-emerald-400"}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="release-gate-heading" className="text-sm font-semibold text-slate-100">Release gate</h2>
          <p className="mt-1 text-xs text-slate-500">Open findings determine the required action.</p>
        </div>
        <Badge tone={analysis.status === "RELEASE BLOCKED" ? "BLOCKER" : analysis.status === "VALIDATION INCOMPLETE" ? "WARNING" : "READY FOR REVIEW"}>{analysis.status}</Badge>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <FindingGroup title="Must fix before release" tone="BLOCKER" items={mustFix} emptyText="No critical or high findings." onSelect={onSelect} />
        <FindingGroup title="Should fix" tone="WARNING" items={shouldFix} emptyText="No medium or low findings." onSelect={onSelect} />
        <FindingGroup title="Clean / verified" tone="PASS" items={clean} emptyText="No categories fully verified yet." />
        <FindingGroup title="Not run" tone="NOT RUN" items={notRun} emptyText="All configured checks ran." />
      </div>
    </section>
  );
}
