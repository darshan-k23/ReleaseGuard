# ReleaseGuard Architecture

## Purpose

ReleaseGuard is a local release-readiness demo for the ShopSphere sample repository. It performs deterministic source/configuration inspection and bounded local build/test validation. IBM Bob is the separate agentic repository-inspection and remediation step; ReleaseGuard does not call Bob.

## Components

```text
Browser
  React + Vite + Tailwind dashboard (frontend/, port 5173)
       | HTTP /api
       v
  Express API (backend/, port 8090)
     | fixed root only
     +--> analyzer/fileWalker.js (bounded, symlink-free source walk)
     +--> analyzer/rules/*.js (security, config, tests, build, deps, docs, integration)
     +--> analyzer/commandRunner.js (fixed npm/Maven commands with timeouts)
     +--> analyzer/scoring.js (severity deductions and release gate)

ShopSphere fixture (demo-project/)
  React + Vite frontend
  Spring Boot 3.5.16 / Java 25 / Maven backend
       ^
       | inspected and changed separately by IBM Bob during the intended workflow
```

## Analysis and API Behavior

- `POST /api/analyze` walks only the canonical `demo-project/` directory and runs the registered rules/checks. The request body cannot supply a path or command.
- `GET /api/analysis/latest` returns the latest in-memory result; before the first run it returns 404. `GET /api/project` derives metadata from ShopSphere source manifests.
- Legacy `/api/release-report`, `/api/issues`, and `/api/release-plan` routes are projections of the same latest analysis; they do not read `backend/data/*.json`.
- The score, release gate, categories, metrics, findings, and remediation plan are assembled from the same findings/checks arrays. The severity-weighted score is a local heuristic, not a release certification.
- Build/test checks use fixed command identifiers, bounded output, explicit timeouts, and a sanitized environment. Their output is redacted before it is returned; it is never written to server logs.
- There is no database, authentication, external AI service, live vulnerability scan, GitHub integration, or CI/CD integration.

## Snapshot and Evidence

Each normalized finding includes an affected source path, exact line range, and evidence copied from that line. Related files can be included for comparisons such as frontend/backend ports. Generated build directories, `target`, `node_modules`, `.git`, logs, oversized files, and symlinks are excluded from source traversal.

ShopSphere metadata is derived from its README, package manifest, and Maven POM. The analyzer parses `package.json`, optional `package-lock.json`, and `pom.xml`; it does not infer dependency age or query CVE data. Maintenance policy: warn on npm version ranges only when no adjacent lockfile pins resolution. Maven dependencies are inspected as declared, including parent-managed versions.

## Boundaries

ReleaseGuard is the deterministic evidence and validation layer. IBM Bob is the separate agentic step for inspection and remediation. The analyzer never accepts arbitrary paths or shell commands, and does not log credential-bearing output. A passing local check does not establish deployment or security readiness. See [IBM_BOB_WORKFLOW.md](IBM_BOB_WORKFLOW.md) for the manual remediation/re-analysis loop.
