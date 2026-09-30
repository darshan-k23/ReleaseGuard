const STYLES = {
  // Category / issue status
  PASS: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "READY FOR REVIEW": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  WARNING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "VALIDATION INCOMPLETE": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  BLOCKER: "bg-red-500/15 text-red-400 border-red-500/30",
  FAIL: "bg-red-500/15 text-red-400 border-red-500/30",
  "NOT RUN": "bg-slate-500/15 text-slate-300 border-slate-500/30",
  // Issue severity
  CRITICAL: "bg-red-500/15 text-red-400 border-red-500/30",
  HIGH: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  MEDIUM: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  LOW: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

export default function Badge({ children, tone }) {
  const style = STYLES[tone] || "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold leading-4 tracking-wide ${style}`}
    >
      {children}
    </span>
  );
}
