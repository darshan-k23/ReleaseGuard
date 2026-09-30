import { useState } from "react";
import Badge from "./Badge.jsx";

export default function RepositoryEntry({
  demoRepositories = [],
  onAnalyzeRepository,
  currentJob,
  currentAnalysis,
  pipelineState = "idle",
  pipelineMessage = "",
}) {
  const [selectedDemoId, setSelectedDemoId] = useState("ShopSphere");
  const [customUrl, setCustomUrl] = useState("");
  const [customBranch, setCustomBranch] = useState("");
  const [inputMode, setInputMode] = useState("demo"); // 'demo' | 'github'

  const isRunning = pipelineState !== "idle" && pipelineState !== "completed" && pipelineState !== "error";

  function handleSubmit(e) {
    e.preventDefault();
    if (isRunning) return;

    if (inputMode === "demo") {
      onAnalyzeRepository({
        demoName: selectedDemoId,
        branch: customBranch || "main",
      });
    } else {
      if (!customUrl.trim()) return;
      onAnalyzeRepository({
        repositoryUrl: customUrl.trim(),
        branch: customBranch.trim() || "main",
      });
    }
  }

  // Derive display values from currentJob and currentAnalysis
  const repoName = currentAnalysis?.repository?.name || currentJob?.repositoryName || (inputMode === "demo" ? selectedDemoId : customUrl.split("/").pop() || "Repository");
  const repoUrl = currentAnalysis?.repository?.url || currentJob?.repositoryUrl || "";
  
  // Parse owner from URL
  let owner = "demo";
  try {
    if (repoUrl && repoUrl.includes("github.com/")) {
      const parts = new URL(repoUrl).pathname.split("/").filter(Boolean);
      if (parts.length >= 2) owner = parts[0];
    }
  } catch {
    owner = "local";
  }

  const branch = currentJob?.branch || currentAnalysis?.job?.branch || "main";
  const commitSha = currentJob?.commitSha || currentAnalysis?.job?.commitSha || (currentJob?.jobId ? `sha-${currentJob.jobId.slice(0, 8)}` : "—");
  const stack = currentAnalysis?.stack || currentJob?.stack || [];

  // Build & Test statuses from checks
  const checks = currentAnalysis?.checks || [];
  const buildCheck = checks.find((c) => c.category === "Build" || c.id === "frontend-build" || c.id === "build-check");
  const testCheck = checks.find((c) => c.category === "Tests" || c.id === "backend-tests" || c.id === "tests-check");

  const buildStatus = buildCheck?.status || (currentJob?.validation?.summary?.failed > 0 ? "FAIL" : currentJob?.validation ? "PASS" : "NOT RUN");
  const testStatus = testCheck?.status || (currentJob?.validation?.summary?.failed > 0 ? "FAIL" : currentJob?.validation ? "PASS" : "NOT RUN");

  const score = typeof currentAnalysis?.score === "number" ? currentAnalysis.score : null;
  const decision = currentAnalysis?.releaseDecision || currentAnalysis?.status || null;

  return (
    <section className="rounded-xl border border-surface-border bg-surface-card p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-surface-border pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
              Repository Gateway
            </span>
          </div>
          <h1 className="mt-1 text-lg font-bold text-slate-100 sm:text-xl">
            Choose Repository &amp; Evaluate Release Readiness
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Analyze any public GitHub repository or pre-configured test repository through deterministic checks and LLM assessment.
          </p>
        </div>

        {/* Input Mode Tabs */}
        <div className="flex rounded-lg bg-surface p-1 border border-surface-border text-xs">
          <button
            type="button"
            onClick={() => setInputMode("demo")}
            disabled={isRunning}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              inputMode === "demo"
                ? "bg-slate-700 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Demo Repositories
          </button>
          <button
            type="button"
            onClick={() => setInputMode("github")}
            disabled={isRunning}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              inputMode === "github"
                ? "bg-slate-700 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            GitHub URL
          </button>
        </div>
      </div>

      {/* Input Selection Form */}
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        {inputMode === "demo" ? (
          <div>
            <label htmlFor="demo-select" className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Select Demo Repository
            </label>
            <select
              id="demo-select"
              value={selectedDemoId}
              onChange={(e) => setSelectedDemoId(e.target.value)}
              disabled={isRunning}
              className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            >
              {demoRepositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.name} ({repo.description})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="github-url" className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Public GitHub Repository URL
            </label>
            <input
              id="github-url"
              type="url"
              placeholder="https://github.com/owner/repository"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              disabled={isRunning}
              required
              className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 font-mono"
            />
          </div>
        )}

        <div className="md:w-32">
          <label htmlFor="branch-input" className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Branch
          </label>
          <input
            id="branch-input"
            type="text"
            placeholder="main"
            value={customBranch}
            onChange={(e) => setCustomBranch(e.target.value)}
            disabled={isRunning}
            className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 font-mono"
          />
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={isRunning || (inputMode === "github" && !customUrl.trim())}
            className="w-full md:w-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-800 border-t-transparent" />
                <span>Analyzing…</span>
              </>
            ) : (
              <>
                <span>▶</span>
                <span>Analyze Repository</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Pipeline Progress Indicator */}
      {isRunning && (
        <div className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3.5 text-xs text-cyan-200">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
              {pipelineMessage || "Executing ReleaseGuard validation pipeline…"}
            </span>
            <span className="font-mono text-[11px] text-cyan-300 capitalize">{pipelineState}</span>
          </div>
          <div className="grid grid-cols-4 gap-2 pt-1">
            {[
              { key: "cloning", label: "1. Clone Repo" },
              { key: "detecting_stack", label: "2. Detect Stack" },
              { key: "validating", label: "3. Validate Builds" },
              { key: "analyzing", label: "4. LLM Assessment" },
            ].map((step, idx) => {
              const activeIdx = ["cloning", "detecting_stack", "validating", "analyzing"].indexOf(pipelineState);
              const stepDone = activeIdx > idx;
              const stepActive = activeIdx === idx;
              return (
                <div
                  key={step.key}
                  className={`rounded px-2 py-1 text-center font-medium transition ${
                    stepDone
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : stepActive
                      ? "bg-cyan-500/30 text-cyan-100 border border-cyan-400 animate-pulse"
                      : "bg-slate-800/40 text-slate-500 border border-slate-700/40"
                  }`}
                >
                  {step.label}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Repository Metadata Bar */}
      {(currentJob || currentAnalysis) && (
        <div className="mt-4 border-t border-surface-border pt-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 text-xs">
            <div className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Repository</span>
              <p className="mt-0.5 truncate font-medium text-slate-100" title={repoName}>
                {repoName}
              </p>
            </div>

            <div className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Owner</span>
              <p className="mt-0.5 truncate font-medium text-slate-300" title={owner}>
                {owner}
              </p>
            </div>

            <div className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Branch</span>
              <p className="mt-0.5 truncate font-mono text-slate-300" title={branch}>
                {branch}
              </p>
            </div>

            <div className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Commit SHA</span>
              <p className="mt-0.5 truncate font-mono text-slate-300" title={commitSha}>
                {commitSha}
              </p>
            </div>

            <div className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Stack</span>
              <p className="mt-0.5 truncate text-slate-300">
                {stack.length > 0
                  ? stack.map((s) => s.ecosystem || s).join(", ")
                  : "Node.js / React"}
              </p>
            </div>

            <div className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Build Status</span>
              <div className="mt-0.5">
                <Badge tone={buildStatus === "PASS" ? "PASS" : buildStatus === "FAIL" ? "FAIL" : "NOT_RUN"}>
                  {buildStatus}
                </Badge>
              </div>
            </div>

            <div className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Test Status</span>
              <div className="mt-0.5">
                <Badge tone={testStatus === "PASS" ? "PASS" : testStatus === "FAIL" ? "FAIL" : "NOT_RUN"}>
                  {testStatus}
                </Badge>
              </div>
            </div>

            <div className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Release Score</span>
              <p className="mt-0.5 font-bold text-slate-100">
                {score !== null ? `${score} / 100` : "—"}
              </p>
            </div>

            <div className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Release Decision</span>
              <div className="mt-0.5">
                {decision ? (
                  <Badge tone={decision === "RELEASE BLOCKED" ? "BLOCKER" : decision === "VALIDATION INCOMPLETE" ? "WARNING" : "READY FOR REVIEW"}>
                    {decision}
                  </Badge>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
