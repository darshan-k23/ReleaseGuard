import Badge from "./Badge.jsx";

function outputText(check) {
  return [check.stdout, check.stderr].filter(Boolean).join("\n").trim();
}

export default function ValidationChecks({ checks }) {
  if (!checks?.length) return null;
  const executed = checks.filter((check) => check.status !== "NOT RUN").length;

  return (
    <section aria-labelledby="checks-heading" className="rounded-xl border border-surface-border bg-surface-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-4 py-3 sm:px-5">
        <div>
          <h2 id="checks-heading" className="text-sm font-semibold text-slate-100">Validation checks</h2>
          <p className="mt-1 text-xs text-slate-500">{executed} of {checks.length} checks executed</p>
        </div>
        <p className="text-[10px] text-slate-600">Output is bounded and redacted</p>
      </div>
      <ul className="divide-y divide-surface-border">
        {checks.map((check) => {
          const output = outputText(check);
          return (
            <li key={check.id} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xs font-semibold text-slate-200">{check.id}</h3>
                    <span className="text-[10px] text-slate-600">{check.category}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{check.summary}</p>
                  {check.command && <p className="mt-1 break-all font-mono text-[10px] text-slate-600">$ {check.command}</p>}
                  {check.reason && <p className="mt-1 text-[11px] text-amber-300">{check.reason}</p>}
                </div>
                <Badge tone={check.status}>{check.status}</Badge>
              </div>
              {output && (
                <details className="mt-2">
                  <summary className="w-fit cursor-pointer rounded text-[11px] text-slate-500 hover:text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                    Show captured output
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-surface-border bg-[#0a0f14] p-3 font-mono text-[11px] leading-5 text-slate-400">{output}</pre>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
