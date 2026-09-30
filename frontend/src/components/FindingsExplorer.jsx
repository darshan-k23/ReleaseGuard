import { useMemo, useState } from "react";
import Badge from "./Badge.jsx";

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export default function FindingsExplorer({ findings, onSelect }) {
  const [severity, setSeverity] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const categories = [...new Set(findings.map((finding) => finding.category))].sort();
  const statuses = [...new Set(findings.map((finding) => finding.status))].sort();
  const visibleFindings = useMemo(() => {
    const query = search.trim().toLowerCase();
    return findings.filter((finding) => {
      if (severity && finding.severity !== severity) return false;
      if (category && finding.category !== category) return false;
      if (status && finding.status !== status) return false;
      if (!query) return true;
      return [finding.ruleId, finding.title, finding.category, finding.affectedFile, finding.evidence, finding.explanation]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [findings, severity, category, status, search]);

  const clearFilters = () => {
    setSeverity("");
    setCategory("");
    setStatus("");
    setSearch("");
  };

  return (
    <section aria-labelledby="findings-heading" className="min-w-0 rounded-xl border border-surface-border bg-surface-card">
      <div className="border-b border-surface-border px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="findings-heading" className="text-sm font-semibold text-slate-100">Findings</h2>
            <p className="mt-1 text-xs text-slate-500">{visibleFindings.length} shown · {findings.length} total</p>
          </div>
          <button type="button" onClick={clearFilters} className="rounded px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">Clear filters</button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className="sm:col-span-2 xl:col-span-1">
            <span className="sr-only">Search findings</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rule, file, evidence…" aria-label="Search findings" className="min-h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-slate-200 placeholder:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400" />
          </label>
          <label>
            <span className="sr-only">Filter by severity</span>
            <select aria-label="Filter by severity" value={severity} onChange={(event) => setSeverity(event.target.value)} className="min-h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
              <option value="">All severities</option>
              {SEVERITIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by category</span>
            <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
              <option value="">All categories</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
              <option value="">All statuses</option>
              {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </div>
      {visibleFindings.length ? (
        <ul className="divide-y divide-surface-border" aria-label="Filtered release findings">
          {visibleFindings.map((finding) => (
            <li key={finding.id}>
              <button type="button" onClick={() => onSelect(finding)} className="console-panel-interactive flex min-h-[4.5rem] w-full min-w-0 items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-400 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-100">{finding.title}</span>
                    <Badge tone={finding.severity}>{finding.severity}</Badge>
                    <Badge tone={finding.status}>{finding.status}</Badge>
                  </span>
                  <span className="mt-1 block break-all font-mono text-[10px] leading-4 text-slate-500">{finding.ruleId} · {finding.affectedFile}:{finding.startLine}</span>
                </span>
                <span className="mt-0.5 hidden max-w-28 shrink-0 text-right text-[10px] leading-4 text-slate-500 sm:block">{finding.category}<span className="ml-1" aria-hidden="true">›</span></span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-5 py-10 text-center" role="status">
          <p className="text-sm font-medium text-slate-300">{findings.length ? "No findings match these filters." : "No findings in this analysis."}</p>
          <p className="mt-1 text-xs text-slate-500">{findings.length ? "Clear one or more filters to broaden the results." : "The configured checks completed without open findings."}</p>
        </div>
      )}
    </section>
  );
}
