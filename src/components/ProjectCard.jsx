export default function ProjectCard({ project, onAnalyze, isAnalyzing, isLoading }) {
  const lastAnalyzed = project?.lastAnalyzed
    ? new Date(project.lastAnalyzed).toLocaleString()
    : "No analysis run";

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-slate-100">
            {project?.name || "ShopSphere"}
          </h2>
          <span className="text-xs text-slate-500">demo-project/</span>
        </div>
        {project?.description && (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            {project.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {project?.stack?.map((tech) => (
            <span
              key={tech}
              className="rounded-md border border-surface-border bg-surface px-2 py-1 text-xs text-slate-300"
            >
              {tech}
            </span>
          ))}
        </div>
            <p className="mt-3 text-xs text-slate-500">
              {project?.lastAnalyzed ? "Last analyzed" : "Analysis status"}:{" "}
          <span className="text-slate-400">{lastAnalyzed}</span>
        </p>
      </div>
      <button
        onClick={onAnalyze}
        disabled={isAnalyzing || isLoading || !project}
        className="shrink-0 rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
            {isAnalyzing ? "Analyzing…" : isLoading ? "Loading…" : "Analyze Repository"}
      </button>
    </div>
  );
}
