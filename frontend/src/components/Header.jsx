export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-surface-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-3 py-3 sm:px-5 lg:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-400/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-emerald-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5l-8-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight text-slate-100">ReleaseGuard</h1>
            <p className="text-[11px] leading-tight text-slate-500">Developer release console</p>
          </div>
        </div>
        <span className="hidden items-center gap-2 rounded-md border border-surface-border bg-surface-card px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />Local analysis</span>
      </div>
    </header>
  );
}
