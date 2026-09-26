import Badge from "./Badge.jsx";

export default function MetricsBar({ metrics }) {
  if (!metrics) return null;
  const testResult = metrics.testStatus === "PASS"
    ? `${metrics.testsPassed}/${metrics.testsChecked}`
    : metrics.testStatus;
  const items = [
    { label: "Issues found", value: metrics.issuesFound },
    { label: "Release blockers", value: metrics.criticalBlockers },
    { label: "Warnings", value: metrics.warnings },
    { label: "Backend tests", value: testResult },
  ];

  const validationItems = [
    { label: "Frontend", status: metrics.frontendBuildStatus },
    { label: "Backend", status: metrics.backendBuildStatus },
    { label: "Backend tests", status: metrics.testStatus },
  ];

  return (
    <section aria-label="Analysis summary metrics" className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className={`console-panel min-w-0 p-3 sm:p-4 ${item.label === "Release blockers" && Number(item.value) > 0 ? "border-l-2 border-l-red-400/70" : ""}`}
        >
          <p className={`text-xl font-bold tabular-nums sm:text-2xl ${item.label === "Release blockers" && Number(item.value) > 0 ? "text-red-200" : "text-slate-100"}`}>{item.value}</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">{item.label}</p>
        </div>
      ))}
      <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-md border border-surface-border bg-surface-card px-3 py-2 sm:col-span-4">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Validation</span>
        {validationItems.map((item) => <span key={item.label} className="inline-flex items-center gap-1.5"><span className="text-[10px] text-slate-500">{item.label}</span><Badge tone={item.status}>{item.status}</Badge></span>)}
      </div>
    </section>
  );
}
