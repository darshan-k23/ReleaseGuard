import { useState } from "react";

/**
 * Renders unified diffs with syntax highlighting and expandable file views.
 */
export default function DiffViewer({ diffText = "", files = [], initialExpanded = true }) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  if (!diffText || !diffText.trim()) {
    return (
      <div className="rounded-md border border-surface-border bg-surface p-3 text-xs text-slate-500 font-mono">
        No file diff changes recorded.
      </div>
    );
  }

  const lines = diffText.split("\n");

  return (
    <div className="rounded-lg border border-surface-border bg-slate-950 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-300 hover:bg-slate-800/80 transition"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-emerald-400 font-semibold">
            {isExpanded ? "▼" : "▶"}
          </span>
          <span className="font-semibold text-slate-200">
            {files.length > 0 ? files.join(", ") : "Unified Patch Diff"}
          </span>
          <span className="text-[10px] text-slate-400">
            ({lines.length} lines)
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
          {isExpanded ? "Collapse Diff" : "Expand Diff"}
        </span>
      </button>

      {isExpanded && (
        <div className="p-2.5 overflow-x-auto max-h-96 font-mono text-[11px] leading-5">
          {lines.map((line, idx) => {
            let lineClass = "text-slate-400";
            let bgClass = "";

            if (line.startsWith("+++") || line.startsWith("---")) {
              lineClass = "text-slate-300 font-bold";
              bgClass = "bg-slate-900/60";
            } else if (line.startsWith("@@")) {
              lineClass = "text-cyan-400 font-semibold";
              bgClass = "bg-cyan-950/20";
            } else if (line.startsWith("+")) {
              lineClass = "text-emerald-300 font-medium";
              bgClass = "bg-emerald-950/40 border-l-2 border-emerald-500 pl-1";
            } else if (line.startsWith("-")) {
              lineClass = "text-rose-300 font-medium";
              bgClass = "bg-rose-950/40 border-l-2 border-rose-500 pl-1";
            }

            return (
              <div
                key={idx}
                className={`flex gap-3 px-2 py-0.5 whitespace-pre ${bgClass}`}
              >
                <span className="select-none text-slate-600 w-8 text-right shrink-0">
                  {idx + 1}
                </span>
                <span className={lineClass}>{line}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
