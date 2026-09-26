import { useEffect, useMemo, useRef, useState } from "react";
import Badge from "./Badge.jsx";
import EvidenceViewer from "./EvidenceViewer.jsx";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSessionEvidence(value) {
  if (!isRecord(value)) return "the top-level JSON value must be an object.";

  const requiredStrings = ["sessionId", "prompt", "summary"];
  for (const field of requiredStrings) {
    if (typeof value?.[field] !== "string" || !value[field].trim()) {
      return `${field} must be a non-empty string.`;
    }
  }

  for (const field of ["findings", "filesChanged", "validation"]) {
    if (!Array.isArray(value[field])) return `${field} must be an array.`;
    if (value[field].some((entry) =>
      typeof entry !== "string" && !isRecord(entry),
    )) {
      return `${field} entries must be strings or JSON objects.`;
    }
  }

  for (const field of ["before", "after"]) {
    if (!isRecord(value[field])) return `${field} must be a JSON object.`;
  }
  return null;
}

function displayEntry(entry) {
  if (typeof entry === "string") return entry;
  return entry.title || entry.summary || entry.ruleId || entry.path || entry.file || JSON.stringify(entry);
}

function displayValue(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "Result not supplied";
  return JSON.stringify(value);
}

function summaryEntries(summary) {
  return Object.entries(summary || {}).map(([key, value]) => [
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
}

function EvidenceList({ title, entries, emptyText }) {
  return (
    <section>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</h4>
      {entries?.length ? (
        <ul className="mt-2 space-y-1.5">
          {entries.map((entry, index) => (
            <li key={`${title}-${index}`} className="rounded border border-surface-border bg-surface px-3 py-2 text-xs text-slate-300">
              {displayEntry(entry)}
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-xs text-slate-600">{emptyText}</p>}
    </section>
  );
}

function buildAnalysisPrompt(analysis, finding) {
  const findingContext = finding
    ? `Selected finding:\nRule: ${finding.ruleId}\nSeverity: ${finding.severity}\nCategory: ${finding.category}\nFile: ${finding.affectedFile}:${finding.startLine}-${finding.endLine}\nEvidence: ${finding.evidence}\nExplanation: ${finding.explanation}\nRelease impact: ${finding.risk}`
    : "No individual finding is selected. Inspect the current blockers listed below.";
  const blockers = analysis.findings
    .filter((item) => item.status === "OPEN" && ["CRITICAL", "HIGH"].includes(item.severity))
    .map((item) => `- ${item.ruleId} ${item.severity}: ${item.affectedFile}:${item.startLine} — ${item.evidence}`)
    .join("\n") || "- No open high/critical blockers.";

  return `You are IBM Bob assisting the developer in a human-in-the-loop workflow. ReleaseGuard does not invoke IBM Bob or delegate work to you.\n\nRepository: demo-project/ (inspect this repository only)\nReleaseGuard analysis ID: ${analysis.analysisId}\nCurrent release status: ${analysis.status}\n\nInspect the repository and relevant files independently. Verify whether the finding below is real. Cite exact file paths and line numbers for all evidence, explain release impact, and avoid unrelated changes. Do not invent findings or assume a clean result. Do not use or request real secrets.\n\n${findingContext}\n\nCurrent blockers from this analysis:\n${blockers}\n\nReturn: verification result, exact evidence, release impact, and a narrowly scoped remediation proposal. Do not modify files until the developer approves the proposed change.`;
}

function buildFixPrompt(finding, analysis) {
  if (!finding) return "Select a finding in ReleaseGuard before generating a Bob fix prompt.";
  return `You are IBM Bob performing an agentic remediation under developer supervision. ReleaseGuard does not invoke IBM Bob.\n\nRepository: demo-project/\nBaseline analysis ID: ${analysis.analysisId}\nFinding: ${finding.ruleId} (${finding.severity}, ${finding.category})\nTitle: ${finding.title}\nFile and line: ${finding.affectedFile}:${finding.startLine}-${finding.endLine}\nEvidence: ${finding.evidence}\nRisk: ${finding.risk}\nRecommended direction: ${finding.recommendedFix}\n\nFix ONLY this issue. Do not perform unrelated cleanup. Preserve every other intentional baseline issue and existing behavior. Explain the change, run the relevant validation command, and report your result using exactly these sections:\n\nBEFORE\nCHANGE\nVALIDATION\nAFTER\n\nCite files changed and exact validation commands/results. Never add real credentials or secrets.`;
}

function CopyButton({ text, label }) {
  const [copyState, setCopyState] = useState("");

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("Copied to clipboard");
    } catch {
      setCopyState("Clipboard access was denied. Select the prompt text and copy it manually.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={copyPrompt} className="min-h-10 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
        {label}
      </button>
      {copyState && <span role="status" aria-live="polite" className="text-[11px] text-slate-400">{copyState}</span>}
    </div>
  );
}

function AnalysisComparison({ comparison }) {
  if (!comparison) return null;
  const previousIds = new Set(comparison.before.findings.map((finding) => finding.id));
  const afterIds = new Set(comparison.after.findings.map((finding) => finding.id));
  const resolved = comparison.before.findings.filter((finding) => !afterIds.has(finding.id));
  const remaining = comparison.after.findings;
  const added = comparison.after.findings.filter((finding) => !previousIds.has(finding.id));
  const scoreDelta = comparison.after.score - comparison.before.score;

  return (
    <section aria-labelledby="comparison-heading" className="mt-4 rounded-lg border border-surface-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 id="comparison-heading" className="text-sm font-semibold text-slate-100">Before / after analysis</h4>
          <p className="mt-1 text-[11px] text-slate-500">This compares repository analyses; it does not verify who made the changes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">Score delta</span>
          <Badge tone={scoreDelta > 0 ? "PASS" : scoreDelta < 0 ? "BLOCKER" : undefined}>{scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}</Badge>
          <span className="text-slate-500">{comparison.before.status}</span>
          <span aria-hidden="true" className="text-slate-600">→</span>
          <span className="text-slate-200">{comparison.after.status}</span>
          <span className="sr-only">Release status comparison</span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Release status {comparison.before.status === comparison.after.status ? "unchanged" : "changed"} · score {comparison.before.score} → {comparison.after.score}
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <EvidenceList title="Resolved findings" entries={resolved.map((finding) => `${finding.ruleId}: ${finding.title}`)} emptyText="No findings resolved between these analyses." />
        <EvidenceList title="Remaining findings" entries={remaining.map((finding) => `${finding.ruleId}: ${finding.title}`)} emptyText="No findings remain." />
        <EvidenceList title="New findings" entries={added.map((finding) => `${finding.ruleId}: ${finding.title}`)} emptyText="No new findings appeared." />
      </div>
    </section>
  );
}

export default function IBMWorkflow({ analysis, isAnalyzing, onReanalyze, comparison, onEvidenceImported }) {
  const initialFinding = analysis.findings.find((finding) =>
    finding.status === "OPEN" && ["CRITICAL", "HIGH"].includes(finding.severity),
  ) || analysis.findings[0];
  const [selectedFindingId, setSelectedFindingId] = useState(initialFinding?.id || "");
  const [importedEvidence, setImportedEvidence] = useState(null);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef(null);
  const selectedFinding = analysis.findings.find((finding) => finding.id === selectedFindingId) || initialFinding;
  const blockers = useMemo(() => analysis.findings.filter((finding) =>
    finding.status === "OPEN" && ["CRITICAL", "HIGH"].includes(finding.severity),
  ), [analysis.findings]);
  const analysisPrompt = useMemo(() => buildAnalysisPrompt(analysis, selectedFinding), [analysis, selectedFinding]);
  const fixPrompt = useMemo(() => buildFixPrompt(selectedFinding, analysis), [selectedFinding, analysis]);

  useEffect(() => {
    setSelectedFindingId(initialFinding?.id || "");
  }, [analysis.analysisId]);

  async function handleEvidenceImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError("");
    try {
      const parsed = JSON.parse(await file.text());
      const validationError = validateSessionEvidence(parsed);
      if (validationError) {
        setImportedEvidence(null);
        onEvidenceImported(null);
        setImportError(`Evidence file is invalid: ${validationError}`);
        return;
      }
      setImportedEvidence(parsed);
      onEvidenceImported({ sessionId: parsed.sessionId, summary: parsed.summary });
    } catch {
      setImportedEvidence(null);
      onEvidenceImported(null);
      setImportError("Evidence file is invalid JSON. Nothing was imported.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <section aria-labelledby="ibm-workflow-heading" className="rounded-xl border border-cyan-400/20 bg-surface-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border pb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Human-in-the-loop workflow</p>
          <h2 id="ibm-workflow-heading" className="mt-1 text-base font-semibold text-slate-100">IBM Bob Workflow</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">ReleaseGuard inspects and validates the repository. A developer separately brings evidence and prompts to IBM Bob for agentic remediation; this app does not invoke Bob.</p>
        </div>
        <span className="rounded border border-surface-border px-2 py-1 text-[10px] font-medium text-slate-500">Developer-mediated · local evidence</span>
      </div>

      <div className="grid gap-4 py-4 xl:grid-cols-2">
        <section aria-labelledby="bob-step-analyze" className="min-w-0 rounded-lg border border-surface-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-cyan-300">01</span>
            <h3 id="bob-step-analyze" className="text-xs font-semibold uppercase tracking-wider text-slate-200">Analyze with ReleaseGuard</h3>
          </div>
          <p className="mt-2 text-xs text-slate-500">{blockers.length} current blocker(s) · analysis {analysis.analysisId}</p>
          {blockers.length ? (
            <ul className="mt-3 space-y-1.5">
              {blockers.map((finding) => (
                <li key={finding.id}>
                  <button type="button" onClick={() => setSelectedFindingId(finding.id)} className={`w-full rounded border px-2.5 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${selectedFinding?.id === finding.id ? "border-cyan-400/40 bg-cyan-400/5" : "border-surface-border hover:bg-white/[0.03]"}`}>
                    <span className="block text-xs font-medium text-slate-200">{finding.title}</span>
                    <span className="mt-1 block truncate font-mono text-[10px] text-slate-500">{finding.affectedFile}:{finding.startLine}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-xs text-slate-500">No current blockers.</p>}

          <label className="mt-4 block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Selected finding</span>
            <select aria-label="Selected finding for IBM Bob" value={selectedFinding?.id || ""} onChange={(event) => setSelectedFindingId(event.target.value)} className="min-h-10 w-full rounded-md border border-surface-border bg-surface-card px-3 text-xs text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
              {analysis.findings.map((finding) => <option key={finding.id} value={finding.id}>{finding.severity} · {finding.ruleId}</option>)}
              {!analysis.findings.length && <option value="">No findings</option>}
            </select>
          </label>
          {selectedFinding && (
            <div className="mt-3 space-y-3">
              <EvidenceViewer file={selectedFinding.affectedFile} startLine={selectedFinding.startLine} endLine={selectedFinding.endLine} evidence={selectedFinding.evidence} />
              <textarea readOnly aria-label="IBM Bob analysis prompt" value={analysisPrompt} rows={8} className="w-full resize-y rounded-md border border-surface-border bg-[#0a0f14] p-3 font-mono text-[11px] leading-5 text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" />
              <CopyButton text={analysisPrompt} label="Copy IBM Bob Analysis Prompt" />
            </div>
          )}
        </section>

        <section aria-labelledby="bob-step-remediate" className="min-w-0 rounded-lg border border-surface-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-cyan-300">02</span>
            <h3 id="bob-step-remediate" className="text-xs font-semibold uppercase tracking-wider text-slate-200">Remediate with Bob</h3>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">Copy a narrowly scoped prompt for the selected finding. Review Bob’s proposed diff before applying it.</p>
          <textarea readOnly aria-label="Bob fix prompt" value={fixPrompt} rows={12} className="mt-3 w-full resize-y rounded-md border border-surface-border bg-[#0a0f14] p-3 font-mono text-[11px] leading-5 text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" />
          <div className="mt-3"><CopyButton text={fixPrompt} label="Copy Bob Fix Prompt" /></div>
        </section>

        <section aria-labelledby="bob-step-import" className="min-w-0 rounded-lg border border-surface-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-cyan-300">03</span>
            <h3 id="bob-step-import" className="text-xs font-semibold uppercase tracking-wider text-slate-200">Import Bob evidence</h3>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">Choose a JSON evidence file from this device. It is parsed in this browser only and is not uploaded or sent to a service.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-10 cursor-pointer items-center rounded-md border border-surface-border px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.03] focus-within:outline focus-within:outline-2 focus-within:outline-cyan-300">
              Import local JSON
              <input ref={fileInputRef} type="file" accept="application/json,.json" aria-label="Import Bob evidence JSON" onChange={handleEvidenceImport} className="sr-only" />
            </label>
            {importedEvidence && <Badge tone="PASS">Imported locally</Badge>}
          </div>
          {importError && <p role="alert" className="mt-3 text-xs text-red-300">{importError}</p>}
          {importedEvidence && (
            <div className="mt-4 space-y-4 border-t border-surface-border pt-4" aria-label="Imported Bob session evidence">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Session ID</span>
                <span className="font-mono text-xs text-slate-200">{importedEvidence.sessionId}</span>
              </div>
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Bob summary</h4>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-300">{importedEvidence.summary}</p>
              </section>
              <EvidenceList title="Findings" entries={importedEvidence.findings} emptyText="Bob reported no findings." />
              <EvidenceList title="Files changed" entries={importedEvidence.filesChanged} emptyText="No files were reported as changed." />
              <EvidenceList title="Validation commands and results" entries={importedEvidence.validation.map((item) => isRecord(item) ? `${item.command || "Command not specified"} — ${displayValue(item.result ?? item.status)}` : item)} emptyText="No validation results were imported." />
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryObject title="Before" summary={importedEvidence.before} />
                <SummaryObject title="After" summary={importedEvidence.after} />
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="bob-step-rerun" className="min-w-0 rounded-lg border border-surface-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-cyan-300">04</span>
            <h3 id="bob-step-rerun" className="text-xs font-semibold uppercase tracking-wider text-slate-200">Re-run ReleaseGuard</h3>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">After reviewing and applying the Bob-assisted change, run the local analyzer again. ReleaseGuard validates repository state; it does not verify who made changes.</p>
          <button type="button" onClick={onReanalyze} disabled={isAnalyzing} className="mt-3 min-h-10 rounded-md border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-wait disabled:opacity-50">
            {isAnalyzing ? "Re-analysis running…" : "Re-run ReleaseGuard"}
          </button>
          <AnalysisComparison comparison={comparison} />
        </section>
      </div>
    </section>
  );
}

function SummaryObject({ title, summary }) {
  const entries = summaryEntries(summary);
  return (
    <section className="min-w-0">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title} summary</h4>
      {entries.length ? (
        <dl className="mt-2 space-y-1.5">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-[11px]">
              <dt className="truncate text-slate-500">{key}</dt>
              <dd className="break-words text-slate-300">{value}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="mt-2 text-xs text-slate-600">No summary supplied.</p>}
    </section>
  );
}
