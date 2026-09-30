import { useEffect, useRef } from "react";
import Badge from "./Badge.jsx";
import EvidenceViewer from "./EvidenceViewer.jsx";

export default function IssueModal({ issue, onClose }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!issue) return undefined;
    const previouslyFocused = document.activeElement;
    closeButtonRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, [issue]);

  if (!issue) return null;

  function handleDialogKeyDown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [...dialogRef.current.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
    if (!focusable.length) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        onKeyDown={handleDialogKeyDown}
        className="max-h-[min(92vh,56rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-surface-border bg-surface-card p-4 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="finding-title"
        aria-describedby="finding-explanation"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge tone={issue.severity}>{issue.severity}</Badge>
            <h2 id="finding-title" className="mt-2 text-lg font-semibold text-slate-100">
              {issue.title}
            </h2>
            <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{issue.ruleId}</p>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg text-slate-400 transition hover:bg-white/5 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            aria-label="Close"
            title="Close issue details"
          >
            ✕
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-surface-border bg-surface p-3 sm:grid-cols-4">
          <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Category</dt><dd className="mt-1 text-xs text-slate-200">{issue.category}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Severity</dt><dd className="mt-1 text-xs text-slate-200">{issue.severity}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Status</dt><dd className="mt-1 text-xs text-slate-200">{issue.status}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Confidence</dt><dd className="mt-1 font-mono text-xs text-slate-200">{Math.round((Number(issue.confidence) || 0) * 100)}%</dd></div>
        </dl>

        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Evidence</h3>
          <EvidenceViewer file={issue.affectedFile} startLine={issue.startLine} endLine={issue.endLine} evidence={issue.evidence} />
          {issue.relatedEvidence?.map((item) => (
            <div key={`${item.affectedFile}:${item.startLine}`} className="mt-3">
              <EvidenceViewer file={item.affectedFile} startLine={item.startLine} endLine={item.endLine} evidence={item.evidence} />
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-4 text-sm">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Explanation</h3>
            <p id="finding-explanation" className="mt-1 leading-6 text-slate-200">{issue.explanation}</p>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Risk</h3>
            <p className="mt-1 leading-6 text-slate-300">{issue.risk}</p>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Recommended fix</h3>
            <p className="mt-1 leading-6 text-emerald-100">{issue.recommendedFix}</p>
          </section>
          {issue.remediationHint && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">IBM Bob remediation hint</h3>
              <p className="mt-1 leading-6 text-slate-300">{issue.remediationHint}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
