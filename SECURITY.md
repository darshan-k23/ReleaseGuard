# Security Policy

## Scope

ReleaseGuard is a developer-tool project that may inspect software repositories, configuration, build output, and test results.

Because the project is intended to analyze repositories, security considerations are especially important.

## Supported Versions

ReleaseGuard is currently an actively developed project rather than a long-term supported product.

Security fixes should target the latest version on the `main` branch unless a maintainer explicitly identifies another supported version.

| Version | Supported |
|---|---|
| `main` | ✅ |
| Older snapshots | ❌ |

## Reporting a Vulnerability

Please do **not** disclose an unpatched security vulnerability through a public GitHub Issue.

Instead, contact the repository maintainers privately through the GitHub repository's available private contact mechanism.

When reporting, include:

- A clear description of the issue.
- The affected component or file.
- Reproduction steps.
- Security impact.
- Any proof-of-concept needed to reproduce safely.
- Suggested mitigation, if known.

Please remove or redact:

- passwords,
- API keys,
- access tokens,
- private repository contents,
- personal information,
- production credentials.

## What Counts as a Security Issue?

Examples include:

- Authentication or authorization bypasses.
- Arbitrary command execution introduced by ReleaseGuard.
- Path traversal in repository/workspace handling.
- Unsafe execution of repository commands.
- Secret leakage through logs, reports, exports, or API responses.
- Unintended exposure of analyzed repository contents.
- Remote code execution caused by untrusted repository processing.
- Prompt-injection pathways that cause the system to perform unsafe actions.
- Vulnerabilities in remediation/patch application that can escape an isolated workspace.

## Repository Analysis Safety

ReleaseGuard may eventually process untrusted Git repositories.

Contributors should therefore treat repository contents as untrusted input.

Important expectations:

- Never execute arbitrary user-supplied commands.
- Use command allowlists where command execution is supported.
- Apply timeouts to build/test operations.
- Restrict filesystem access to the intended workspace.
- Avoid exposing `.env`, private keys, Git internals, or secrets.
- Avoid storing raw repository contents unnecessarily.
- Prefer isolated execution environments for untrusted repository builds/tests.

## AI and LLM Safety

AI-generated output must not be treated as proof that a repository is secure or release-ready.

LLM output should be constrained by supplied evidence and clearly separated from deterministic validation.

Contributors adding LLM features should consider:

- prompt injection,
- malicious repository instructions,
- data leakage,
- unsafe generated patches,
- hallucinated findings,
- unsupported security claims,
- excessive repository context exposure.

## Secret Handling

Never commit:

```text
.env
.env.*
*.pem
*.key
credentials files
API tokens
production passwords
private repository data
```

Use local environment variables or an appropriate secret-management mechanism.

## Responsible Disclosure

Security reports will be reviewed by the maintainers and handled in good faith.

Please allow reasonable time for investigation and remediation before public disclosure.

## Security-Related Contributions

Security improvements are welcome.

When submitting one, explain:

- the threat being addressed,
- the attack surface,
- why the mitigation works,
- how it was tested,
- and any remaining limitations.

Thank you for helping keep ReleaseGuard and its users safe.
