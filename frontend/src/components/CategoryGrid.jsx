import Badge from "./Badge.jsx";

export default function CategoryGrid({ categories, findings = [] }) {
  if (!categories?.length) return null;
  const findingCounts = findings.reduce((counts, finding) => {
    counts[finding.category] = (counts[finding.category] || 0) + 1;
    return counts;
  }, {});

  return (
    <section aria-labelledby="categories-heading" className="rounded-xl border border-surface-border bg-surface-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="categories-heading" className="text-sm font-semibold text-slate-100">Category checks</h2>
        <span className="text-[10px] text-slate-600">{categories.length} areas</span>
      </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
      {categories.map((cat) => (
        <div
          key={cat.name}
          className="min-w-0 rounded-md border border-surface-border bg-surface px-3 py-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-200">
              {cat.name}
            </h3>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-slate-500" aria-label={`${findingCounts[cat.name] || 0} findings`}>
                {findingCounts[cat.name] || 0} findings
              </span>
              <Badge tone={cat.status}>{cat.status}</Badge>
            </div>
          </div>
          <p className="mt-2 text-sm leading-5 text-slate-400">{cat.summary}</p>
        </div>
      ))}
    </div>
    </section>
  );
}
