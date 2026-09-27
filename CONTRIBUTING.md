# Contributing to ReleaseGuard

Thank you for contributing to ReleaseGuard.

ReleaseGuard is focused on one core engineering question:

> **Is this software project ready to release?**

Contributions should strengthen that goal through better repository analysis, evidence, validation, remediation workflows, documentation, usability, or developer tooling.

## Before You Start

Please:

1. Read the main [`README.md`](README.md).
2. Check existing Issues and Pull Requests before opening a new one.
3. Keep changes focused and explain why they improve ReleaseGuard.
4. Never commit real credentials, private repository data, API keys, tokens, or environment files containing secrets.

For security vulnerabilities, do not open a public issue. Follow [`SECURITY.md`](SECURITY.md).

## Development Setup

The current MVP uses:

- React
- Vite
- Tailwind CSS
- Node.js
- Express
- Git/GitHub
- ShopSphere as the controlled demonstration repository

Typical local startup:

### Backend

```bash
cd releaseguard/backend
npm install
npm run dev
```

### Frontend

Open a second terminal:

```bash
cd releaseguard/frontend
npm install
npm run dev
```

The dashboard is normally available at:

```text
http://localhost:5173
```

The backend is normally available at:

```text
http://localhost:8090
```

## Contribution Areas

Useful contributions include:

- Repository-analysis rules
- Build and test validation
- Evidence extraction
- Release scoring
- UI/UX improvements
- Documentation
- Developer experience
- IBM Bob workflow documentation
- Local LLM/provider integrations
- Test coverage
- Demo repositories
- Future VS Code integration

## Working Principles

### 1. Evidence First

A release finding should, where practical, be backed by observable evidence:

```text
Rule
→ File
→ Line
→ Evidence
→ Risk
→ Recommendation
→ Validation
```

Avoid vague findings that cannot be reproduced.

### 2. Deterministic Results Matter

Build and test outcomes must come from actual validation.

Do not report:

- PASS because an AI model predicted success.
- FAIL without captured evidence.
- A vulnerability without supporting evidence.

AI can help interpret evidence and propose remediation, but validation should establish the actual result.

### 3. Keep Scope Focused

Prefer a small, understandable change over a broad architectural rewrite.

Avoid introducing a new database, authentication system, or major framework unless the change is explicitly agreed upon.

### 4. Protect Repository Data

When working with external repositories:

- Avoid logging file contents unnecessarily.
- Never persist secrets.
- Keep temporary analysis workspaces isolated.
- Avoid arbitrary command execution.
- Treat untrusted repository code as untrusted.

## Branching

Use a descriptive branch name such as:

```text
feature/repository-ingestion
feature/security-rules
fix/score-calculation
docs/ibm-bob-workflow
```

## Commit Messages

Prefer clear, action-oriented commits:

```text
feat: add repository stack detection
fix: prevent path traversal in workspace access
docs: clarify IBM Bob remediation workflow
test: cover credential detection rule
```

## Pull Requests

A good PR should explain:

- What changed?
- Why was it needed?
- What files/components are affected?
- How was it tested?
- Are there UI changes?
- Are there security implications?
- Are any limitations or follow-up tasks known?

Use the repository PR template.

## Testing

Before opening a PR, run the relevant checks.

At minimum for frontend changes:

```bash
npm run build
```

For backend changes:

```bash
npm test
```

or the project's configured validation command.

If a dependency or external service is unavailable, document that explicitly rather than converting an unavailable check into a passing result.

## Documentation

Update documentation when behavior, API endpoints, setup instructions, or user workflows change.

If you add a feature that affects the demo narrative, update the appropriate documentation in `docs/`.

## AI-Assisted Contributions

AI coding tools, including IBM Bob and other coding assistants, may be used.

However:

- The contributor remains responsible for the submitted code.
- Review generated code before committing.
- Test important behavior.
- Do not blindly accept generated security fixes.
- Clearly document material AI-assisted changes when useful for maintainers.

## Adding Analysis Rules

When adding a release-readiness rule, include:

1. Rule ID.
2. Category.
3. Severity definition.
4. Detection logic.
5. Evidence format.
6. Positive tests.
7. Negative tests.
8. Recommended remediation.
9. Validation strategy.
10. Known limitations or false-positive considerations.

## Adding Demo Repositories

Demo repositories should contain:

- Safe synthetic data only.
- Clearly documented intentional issues.
- Reproducible build/test behavior.
- No real credentials or secrets.
- A README explaining the intended scenario.

Do not hardcode a ReleaseGuard score into a demo repository. The score should be produced by ReleaseGuard's analysis.

## Review Standard

A contribution is ready when it is:

- understandable,
- focused,
- tested,
- documented where necessary,
- secure by default,
- consistent with the ReleaseGuard product purpose.

Thank you for helping improve ReleaseGuard.
