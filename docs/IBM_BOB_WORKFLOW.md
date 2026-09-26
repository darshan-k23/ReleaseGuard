# IBM Bob Workflow

## Human-In-The-Loop Sequence

```text
ReleaseGuard analysis
		-> developer reviews findings and copies a prompt
		-> IBM Bob independently inspects the repository
		-> developer reviews Bob's proposed diff
		-> Bob-assisted remediation is applied and validated
		-> developer imports sanitized session evidence locally
		-> ReleaseGuard re-analysis
		-> developer compares resolved and remaining findings
```

ReleaseGuard does **not** invoke IBM Bob, submit prompts to Bob, or receive a
Bob response automatically. IBM Bob-assisted remediation is performed by a
developer in the IBM Bob workflow. ReleaseGuard validates repository state
before and after; it does not certify who made a change.

## Console Steps

1. **Analyze with ReleaseGuard.** Run the local deterministic analysis. Review
	 blocker count, exact source evidence, and the selected finding. **Copy IBM
	 Bob Analysis Prompt** creates a prompt from the current analysis and tells
	 Bob to inspect the repository and relevant files independently, verify the
	 finding, cite file/line evidence, explain release impact, and avoid
	 unrelated changes.
2. **Remediate with Bob.** Open the prompt in IBM Bob yourself. **Copy Bob Fix
	 Prompt** scopes work to the selected finding, preserves the remaining
	 baseline, and asks Bob to report `BEFORE`, `CHANGE`, `VALIDATION`, and
	 `AFTER`. Review the proposed diff before applying it.
3. **Import Bob evidence.** Save sanitized output using
	 [`../bob_sessions/template-session.json`](../bob_sessions/template-session.json)
	 and import it from the browser. The JSON is parsed in the local page only;
	 it is not uploaded to ReleaseGuard's API or a third-party service. Required
	 fields are non-empty `sessionId`, `prompt`, and `summary`; arrays
	 `findings`, `filesChanged`, and `validation`; and object fields `before`
	 and `after`. Imported evidence is informational, not independently
	 attested by ReleaseGuard.
4. **Re-run ReleaseGuard.** Click **Re-run ReleaseGuard** after the approved
	 change and validation. The console compares the prior and new analyzer
	 results by finding ID and displays resolved, remaining, and newly observed
	 findings, score delta, and release status transition. No Bob activity is
	 inferred from this comparison.

## Safety And Limits

- Never include real passwords, tokens, API keys, private customer data, or
	production connection details in prompts or imported session evidence.
- Keep the baseline's unrelated intentional findings intact when asking Bob
	to fix one issue.
- Treat imported `validation` entries as developer-provided evidence; the
	analyzer's own build/test results remain authoritative for the current
	repository state.
- Build and test commands are allowlisted and time-bounded. `PASS`, `FAIL`,
	and `NOT RUN` remain distinct.
- Dependency checks use a documented local maintenance policy and do not
	query a live CVE source.
- Before/after comparison does not measure or claim time savings.
