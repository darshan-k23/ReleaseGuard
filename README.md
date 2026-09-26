# ReleaseGuard

**Release-readiness demo** — built for the IBM Bob 2.0 Hackathon.

ReleaseGuard inspects the checked-in ShopSphere demo repository and
produces a deterministic, evidence-backed analysis with a prioritized
remediation list. It does not certify production readiness.

The dashboard is React + Vite + Tailwind, backed by a Node.js + Express
API. `POST /api/analyze` inspects only `demo-project/`, runs local build
and backend test commands from an allowlist, and returns one analysis
object from which findings, categories, score, status, metrics, and plan
are derived. No external AI or vulnerability database is called. There
is no database or authentication.

## Project structure

```
releaseguard/
├── frontend/       React + Vite + Tailwind dashboard
├── backend/        Express API and deterministic repository analyzer
├── demo-project/   ShopSphere — a small, intentionally imperfect
│                   React + Spring Boot app used as the analysis target
├── docs/           Architecture and IBM Bob workflow
├── bob_sessions/   Sanitized notes from manual Bob-assisted sessions
└── README.md
```

## Running it

You need two terminals — one for the backend, one for the frontend.
(`demo-project/` is inspected by the analyzer; the ShopSphere app itself
does not need to be running.)

### 1. Backend (port 8090)

```bash
cd backend
npm install
npm run dev
```

### 2. Frontend (port 5173)

```bash
cd frontend
npm install
npm run dev
```

Then open **http://localhost:5173**.

To run the frontend browser checks, use `npm run test:e2e` from
`frontend/`. The checks use Microsoft Edge on the test machine.

## Demo flow

1. The dashboard loads ShopSphere metadata and the latest in-memory analysis, if one exists.
2. Click **Analyze Repository** to walk the fixed ShopSphere root and run the bounded checks.
3. Review the score and release gate. The score is a local heuristic, not an industry standard or production certification.
4. Review findings with exact source lines and any related-file evidence.
5. Check build/test outcomes. `PASS`, `FAIL`, and `NOT RUN` are separate states; command output is redacted and bounded.
6. Use [docs/IBM_BOB_WORKFLOW.md](docs/IBM_BOB_WORKFLOW.md) for the separate IBM Bob-assisted remediation step and re-analysis loop.

## What's "wrong" with the demo project, on purpose

`demo-project/` (ShopSphere) is an intentionally incomplete analysis
target. Findings are generated from the current checked-in files and
command results on each analysis; they are not read from `backend/data/`
fixtures. The analyzer does not treat environment references or safe
synthetic placeholders as exposed secrets.

## Notes on scope

IBM Bob remains the separate agentic remediation step; ReleaseGuard is
the deterministic evidence and local validation layer. There is no Bob
integration in the app. Dependency review follows the documented
maintenance policy and is not a live CVE scan. This MVP also has no
GitHub OAuth, CI/CD, Docker orchestration, deployment integration,
external AI API, authentication, or database. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for its implementation
boundary and safety limits.
