export default function ReleasePlan({ plan }) {
  if (!plan?.length) return null;
  return (
    <section className="min-w-0 rounded-lg border border-surface-border bg-surface-card p-5">
      <h2 className="text-sm font-semibold text-slate-200">
        Recommended Fix Plan
      </h2>
      <p className="mt-1 text-xs text-slate-500">
            Prioritized steps generated from this analysis's open findings.
      </p>
      <ol className="mt-4 space-y-3">
        {plan
          .slice()
          .sort((a, b) => a.priority - b.priority)
          .map((step) => (
                <li key={step.relatedFindingId} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface border border-surface-border text-xs font-semibold text-slate-300">
                {step.priority}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-200">
                  {step.title}
                </p>
                <p className="mt-1 text-sm leading-5 text-slate-400">{step.description}</p>
                    {step.remediationHint && (
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {step.remediationHint}
                      </p>
                    )}
              </div>
            </li>
          ))}
      </ol>
    </section>
  );
}
