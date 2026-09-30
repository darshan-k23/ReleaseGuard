import Badge from "./Badge.jsx";

export default function ReleaseDecision({ report }) {
  if (!report) return null;
  const blocked = report.status === "RELEASE BLOCKED";
  const incomplete = report.status === "VALIDATION INCOMPLETE";
  const tone = blocked ? "BLOCKER" : incomplete ? "WARNING" : "READY FOR REVIEW";

  return (
    <div
      className={`rounded-xl border p-5 ${
        blocked
          ? "border-red-500/30 bg-red-500/5"
          : incomplete
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-emerald-500/30 bg-emerald-500/5"
      }`}
    >
      <div className="flex items-center gap-2">
        <Badge tone={tone}>{report.status}</Badge>
      </div>
      <p className="mt-2 text-sm text-slate-300">{report.statusSummary}</p>
    </div>
  );
}
