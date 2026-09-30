export default function EvidenceViewer({ file, startLine, endLine, evidence }) {
  const lines = String(evidence || "").split(/\r?\n/);
  const lastLine = Number(endLine) || Number(startLine) || 1;

  return (
    <figure className="overflow-hidden rounded-md border border-surface-border-strong bg-[#0a0f14] shadow-inner shadow-black/20">
      <figcaption className="flex min-w-0 items-start gap-2 border-b border-surface-border bg-surface px-3 py-2.5">
        <span className="shrink-0 rounded border border-emerald-400/20 bg-emerald-400/5 px-1 font-mono text-[10px] text-emerald-300" aria-hidden="true">CODE</span>
        <span className="min-w-0 break-all font-mono text-[11px] leading-5 text-slate-300" title={file}>{file}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">L{startLine}{lastLine !== Number(startLine) ? `–${lastLine}` : ""}</span>
      </figcaption>
      <pre className="max-w-full overflow-x-auto py-2 text-[13px] leading-7" aria-label={`Code evidence from ${file}`}>
        <code>
          {lines.map((line, index) => (
            <span key={`${index}-${line}`} className="grid min-w-max grid-cols-[3.25rem_minmax(0,1fr)] pr-4">
              <span className="select-none border-r border-surface-border px-3 text-right font-mono text-slate-600" aria-hidden="true">{Number(startLine) + index}</span>
              <span className={`whitespace-pre px-3 font-mono ${index === 0 ? "border-l-2 border-amber-300 bg-amber-300/10 text-amber-100" : "text-slate-400"}`}>
                {line || " "}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
