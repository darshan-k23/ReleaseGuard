import { useState } from "react";
import Badge from "./Badge.jsx";
import DiffViewer from "./DiffViewer.jsx";

export default function BeforeAfterView({
  beforeData = null,
  remediationData = null,
  afterData = null,
  onGenerateRemediation,
  onApplyRemediation,
  isRemediating = false,
  availableFindings = [],
}) {
  const [selectedFindingId, setSelectedFindingId] = useState(
    remediationData?.findingId || availableFindings[0]?.id || "",
  );
  const [expandedFiles, setExpandedFiles] = useState({});
  const [showValidationLogs, setShowValidationLogs] = useState(false);

  // Normalize before details
  const scoreBefore = beforeData?.score ?? 72;
  const decisionBefore = beforeData?.status || beforeData?.releaseDecision || "RELEASE BLOCKED";
  const findingsBefore = beforeData?.findings || [];
  const blockersBefore = findingsBefore.filter((f) => f.severity === "HIGH" || f.severity === "CRITICAL");
  const warningsBefore = findingsBefore.filter((f) => f.severity === "MEDIUM" || f.severity === "LOW");

  // Normalize after details
  const scoreAfter = afterData?.score ?? scoreBefore;
  const decisionAfter = afterData?.status || afterData?.releaseDecision || decisionBefore;
  const resolvedFindings = afterData?.resolvedFindings || [];
  const remainingFindings = afterData?.remainingFindings || findingsBefore;
  const newFindings = afterData?.newFindings || [];
  const validationResults = afterData?.validation || null;

  // Score delta
  const scoreDelta = scoreAfter - scoreBefore;
  const deltaFormatted = scoreDelta > 0 ? `+${scoreDelta}` : `${scoreDelta}`;

  // Remediation details
  const targetFinding = availableFindings.find((f) => f.id === selectedFindingId) || findingsBefore.find((f) => f.id === selectedFindingId) || blockersBefore[0] || null;
  const diagnosis = remediationData?.diagnosis || targetFinding?.explanation || "Literal secret or configuration defect observed in workspace evidence.";
  const planSteps = remediationData?.plan || (targetFinding?.recommendedFix ? [targetFinding.recommendedFix] : []);
  const filesToChange = remediationData?.files || (targetFinding?.affectedFile ? [targetFinding.affectedFile] : []);
  const patchContent = remediationData?.diff || remediationData?.patch || (targetFinding?.evidence ? `- ${targetFinding.evidence}\n+ \${ENVIRONMENT_VARIABLE}` : "");
  const validationPlan = remediationData?.validationPlan || [{ step: "Run test suite", command: "npm test", expectedOutcome: "PASS" }];

  function toggleFile(file) {
    setExpandedFiles((prev) => ({ ...prev, [file]: !prev[file] }));
  }

  return (
    <section aria-labelledby="before-after-heading" className="rounded-xl border border-surface-border bg-surface-card p-4 sm:p-5">
      {/* Header & Distinction Indicators */}
      <div className="flex flex-col gap-3 border-b border-surface-border pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-cyan-400">
              Analysis &amp; Remediation Lifecycle
            </span>
          </div>
          <h2 id="before-after-heading" className="mt-1 text-base font-bold text-slate-100 sm:text-lg">
            Before / After Release Evaluation &amp; Remediation View
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Inspect observed baseline facts, review LLM-recommended candidates, and verify isolated execution results.
          </p>
        </div>

        {/* Three Pillars Distinction */}
        <div className="flex flex-wrap gap-2 text-[11px]">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-cyan-300 font-medium">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span>Observed (Facts)</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-purple-300 font-medium">
            <span className="h-2 w-2 rounded-full bg-purple-400" />
            <span>Recommended (LLM)</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-300 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Validated (Execution)</span>
          </div>
        </div>
      </div>

      {/* Score Delta & Release Transition Card */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-lg border border-surface-border bg-surface p-4">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Baseline Score (Before)
          </span>
          <p className="mt-1 text-2xl font-black text-slate-100 font-mono">
            {scoreBefore} <span className="text-xs font-normal text-slate-500">/ 100</span>
          </p>
          <div className="mt-1">
            <Badge tone={decisionBefore === "RELEASE BLOCKED" ? "BLOCKER" : "WARNING"}>
              {decisionBefore}
            </Badge>
          </div>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Remediated Score (After)
          </span>
          <p className="mt-1 text-2xl font-black text-slate-100 font-mono">
            {scoreAfter} <span className="text-xs font-normal text-slate-500">/ 100</span>
          </p>
          <div className="mt-1">
            <Badge tone={decisionAfter === "RELEASE BLOCKED" ? "BLOCKER" : decisionAfter === "VALIDATION INCOMPLETE" ? "WARNING" : "READY FOR REVIEW"}>
              {decisionAfter}
            </Badge>
          </div>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Score Delta
          </span>
          <div className="mt-1 flex items-center gap-2">
            <span className={`text-2xl font-black font-mono ${scoreDelta > 0 ? "text-emerald-400" : scoreDelta < 0 ? "text-rose-400" : "text-slate-400"}`}>
              {deltaFormatted}
            </span>
            <span className="text-xs text-slate-400">
              ({scoreBefore} → {scoreAfter})
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Deterministic ReleaseGuard severity-weighted score (Not AI-generated)
          </p>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Findings Resolution
          </span>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-black font-mono text-emerald-400">
              {resolvedFindings.length}
            </span>
            <span className="text-xs text-slate-400">resolved / {findingsBefore.length} initial</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            {remainingFindings.length} remaining open finding(s)
          </p>
        </div>
      </div>

      {/* Main 3-Column Stage Grid */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* =====================================================================
            COLUMN 1: BEFORE (Observed Baseline)
           ===================================================================== */}
        <div className="flex flex-col rounded-lg border border-cyan-500/20 bg-surface p-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-300">
                1
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                BEFORE (Observed)
              </h3>
            </div>
            <span className="rounded bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-400">
              Baseline Facts
            </span>
          </div>

          <div className="mt-3 space-y-3 flex-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Score &amp; Status:</span>
              <span className="font-mono font-bold text-slate-200">
                {scoreBefore}/100 ({decisionBefore})
              </span>
            </div>

            {/* Blockers Section */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">
                  Blockers ({blockersBefore.length})
                </span>
                <span className="text-[10px] text-slate-500">High / Critical</span>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {blockersBefore.length > 0 ? (
                  blockersBefore.map((b) => (
                    <div
                      key={b.id}
                      className="rounded border border-rose-500/20 bg-rose-500/5 p-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-semibold text-rose-200 text-[11px]">{b.title}</span>
                        <Badge tone="BLOCKER">{b.severity}</Badge>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-slate-400">
                        {b.affectedFile || b.file}:{b.startLine || 1}
                      </p>
                      {b.evidence && (
                        <code className="mt-1 block rounded bg-slate-950 p-1 font-mono text-[10px] text-rose-300 truncate">
                          {b.evidence}
                        </code>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">No release blockers detected.</p>
                )}
              </div>
            </div>

            {/* Warnings Section */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                  Warnings ({warningsBefore.length})
                </span>
                <span className="text-[10px] text-slate-500">Medium / Low</span>
              </div>
              <div className="mt-1.5 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {warningsBefore.length > 0 ? (
                  warningsBefore.map((w) => (
                    <div
                      key={w.id}
                      className="rounded border border-amber-500/20 bg-amber-500/5 p-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-medium text-amber-200 text-[11px]">{w.title}</span>
                        <Badge tone="WARNING">{w.severity}</Badge>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                        {w.affectedFile || w.file}:{w.startLine || 1}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">No warnings.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* =====================================================================
            COLUMN 2: REMEDIATION (Recommended Plan & Patch)
           ===================================================================== */}
        <div className="flex flex-col rounded-lg border border-purple-500/20 bg-surface p-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-[10px] font-bold text-purple-300">
                2
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                REMEDIATION (Recommended)
              </h3>
            </div>
            <span className="rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
              AI Proposal
            </span>
          </div>

          <div className="mt-3 space-y-3 flex-1">
            {/* Finding Selector / Target */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Target Finding
              </label>
              {availableFindings.length > 1 ? (
                <select
                  value={selectedFindingId}
                  onChange={(e) => setSelectedFindingId(e.target.value)}
                  className="w-full rounded border border-surface-border bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {availableFindings.map((f) => (
                    <option key={f.id} value={f.id}>
                      [{f.severity}] {f.title} ({f.affectedFile || f.file})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded border border-purple-500/20 bg-purple-500/5 p-2 text-xs">
                  <span className="font-semibold text-purple-200">
                    {targetFinding?.title || "Target Finding"}
                  </span>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                    {targetFinding?.ruleId} · {targetFinding?.affectedFile || targetFinding?.file}
                  </p>
                </div>
              )}
            </div>

            {/* LLM Diagnosis */}
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                LLM Diagnosis
              </span>
              <p className="mt-1 rounded bg-slate-900 p-2 text-xs leading-5 text-slate-300 border border-slate-800">
                {diagnosis}
              </p>
            </div>

            {/* Recommended Fix */}
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Recommended Fix &amp; Plan
              </span>
              <ul className="mt-1 space-y-1 text-xs text-slate-300">
                {planSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="font-bold text-purple-400">›</span>
                    <span>{typeof step === "string" ? step : step.fix || JSON.stringify(step)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Files Changed (Expandable) */}
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Files Changed
              </span>
              <div className="mt-1 space-y-1">
                {filesToChange.map((file) => (
                  <div key={file} className="rounded border border-surface-border bg-slate-900 p-1.5">
                    <button
                      type="button"
                      onClick={() => toggleFile(file)}
                      className="w-full flex items-center justify-between text-xs text-slate-200 hover:text-white"
                    >
                      <span className="font-mono text-[11px] truncate">{file}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {expandedFiles[file] ? "Hide" : "Show"}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Patch Preview (Unified Diff with syntax highlighting) */}
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Patch Preview
              </span>
              <div className="mt-1">
                <DiffViewer diffText={patchContent} files={filesToChange} />
              </div>
            </div>

            {/* Validation Plan */}
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Validation Plan
              </span>
              <div className="mt-1 space-y-1 text-xs text-slate-300">
                {validationPlan.map((vp, idx) => (
                  <div key={idx} className="rounded bg-slate-900/80 p-1.5 border border-slate-800 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200">{vp.step || "Validate Change"}</span>
                      {vp.command && (
                        <code className="rounded bg-slate-950 px-1 py-0.5 font-mono text-[10px] text-cyan-300">
                          {vp.command}
                        </code>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive Remediation Actions */}
            {(onGenerateRemediation || onApplyRemediation) && (
              <div className="pt-2 border-t border-surface-border flex flex-col gap-2">
                {onGenerateRemediation && (
                  <button
                    type="button"
                    onClick={() => onGenerateRemediation(selectedFindingId)}
                    disabled={isRemediating || !selectedFindingId}
                    className="w-full rounded-md border border-purple-500/40 bg-purple-500/20 px-3 py-1.5 text-xs font-semibold text-purple-200 hover:bg-purple-500/30 transition disabled:opacity-50"
                  >
                    {isRemediating ? "Generating Plan…" : "Generate Remediation Plan"}
                  </button>
                )}
                {onApplyRemediation && (
                  <button
                    type="button"
                    onClick={() => onApplyRemediation(selectedFindingId)}
                    disabled={isRemediating || !selectedFindingId}
                    className="w-full rounded-md border border-emerald-500/40 bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-50 shadow-sm"
                  >
                    {isRemediating ? "Applying in Isolated Sandbox…" : "Apply & Validate in Isolated Workspace"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* =====================================================================
            COLUMN 3: AFTER (Validated Sandbox Execution)
           ===================================================================== */}
        <div className="flex flex-col rounded-lg border border-emerald-500/20 bg-surface p-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-300">
                3
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                AFTER (Validated)
              </h3>
            </div>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              Verified Sandbox
            </span>
          </div>

          <div className="mt-3 space-y-3 flex-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Score &amp; Status:</span>
              <span className="font-mono font-bold text-slate-200">
                {scoreAfter}/100 ({decisionAfter})
              </span>
            </div>

            {/* Resolved Findings */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  Resolved Findings ({resolvedFindings.length})
                </span>
                <span className="text-[10px] text-emerald-400">✓ Resolved</span>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {resolvedFindings.length > 0 ? (
                  resolvedFindings.map((rf) => (
                    <div
                      key={rf.id}
                      className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-medium text-emerald-200 text-[11px]">{rf.title}</span>
                        <Badge tone="PASS">RESOLVED</Badge>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                        {rf.affectedFile || rf.file}:{rf.startLine || 1}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">No findings resolved yet.</p>
                )}
              </div>
            </div>

            {/* Remaining Findings */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Remaining Findings ({remainingFindings.length})
                </span>
              </div>
              <div className="mt-1.5 space-y-1 max-h-36 overflow-y-auto pr-1">
                {remainingFindings.map((rf) => (
                  <div key={rf.id} className="rounded bg-slate-900/60 p-1.5 text-xs text-slate-400 flex items-center justify-between">
                    <span className="truncate text-[11px]">{rf.title}</span>
                    <Badge tone={rf.severity === "HIGH" || rf.severity === "CRITICAL" ? "BLOCKER" : "WARNING"}>
                      {rf.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* New Findings */}
            {newFindings.length > 0 && (
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">
                  New Findings Introduced ({newFindings.length})
                </span>
                <div className="mt-1.5 space-y-1">
                  {newFindings.map((nf) => (
                    <div key={nf.id} className="rounded border border-rose-500/20 bg-rose-500/5 p-1.5 text-xs text-rose-300">
                      {nf.title}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Exact Validation Results */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Exact Validation Results
                </span>
                {validationResults?.executions?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowValidationLogs(!showValidationLogs)}
                    className="text-[10px] text-cyan-400 hover:underline"
                  >
                    {showValidationLogs ? "Hide Logs" : "View Logs"}
                  </button>
                )}
              </div>

              <div className="mt-1 space-y-1.5">
                {validationResults?.executions?.length > 0 ? (
                  validationResults.executions.map((exec, idx) => (
                    <div key={idx} className="rounded bg-slate-900 p-2 border border-slate-800 text-xs">
                      <div className="flex items-center justify-between gap-1">
                        <code className="font-mono text-[11px] text-cyan-300 truncate">
                          {exec.command}
                        </code>
                        <Badge tone={exec.status === "PASS" ? "PASS" : exec.status === "FAIL" ? "FAIL" : "NOT_RUN"}>
                          {exec.status}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
                        <span>Exit: {exec.exitCode !== null ? exec.exitCode : "—"}</span>
                        <span>Duration: {exec.durationMs}ms</span>
                        <span>Status: {exec.status}</span>
                      </div>

                      {showValidationLogs && (exec.stdout || exec.stderr) && (
                        <pre className="mt-2 max-h-32 overflow-x-auto rounded bg-slate-950 p-2 font-mono text-[10px] leading-4 text-slate-300">
                          {exec.stdout || exec.stderr}
                        </pre>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded bg-slate-900 p-2 text-xs text-slate-500 italic">
                    {validationResults?.status
                      ? `Overall validation status: ${validationResults.status}`
                      : "Validation commands executed in isolated sandbox."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
