import { createCheck, CHECK_STATUS } from "../types.js";
import { createFinding, findLine } from "../utils/evidence.js";

const SECRET_KEY = /\b(password|passwd|secret|token|api[_-]?key|client[_-]?secret|private[_-]?key|access[_-]?key)\b\s*[:=]\s*(?:(["'`])([^"'`]+)\2|([^\s"'`,;]+))/i;
const ENV_REFERENCE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Z][A-Z0-9_]*|process\.env\.|System\.getenv\(|os\.environ/i;
const SAFE_VALUE = /^(?:example|sample|dummy|fake|test|demo|placeholder|redacted|changeme|none|null|undefined|false|true|\d+|<[^>]+>)(?:[-_.].*)?$/i;
const SOURCE_EXTENSION = /\.(?:properties|ya?ml|env|conf|json|xml|java|[cm]?js|jsx|ts|tsx)$/i;
const CONFIG_EXTENSION = /\.(?:properties|ya?ml|env|conf|toml|ini)$/i;
const SYNTHETIC_SENTINEL = "demo-only-not-a-secret";

function isComment(line) {
  return /^\s*(?:#|\/\/|\*|<!--)/.test(line);
}

function isSafeLiteral(value, line) {
  return (
    ENV_REFERENCE.test(value) ||
    SAFE_VALUE.test(value) ||
    /\b(?:synthetic example|example only|demo only|test fixture|not a real secret)\b/i.test(line)
  );
}

export function runSecurityRule(context) {
  const findings = [];
  let scannedLines = 0;

  for (const source of context.files) {
    if (!SOURCE_EXTENSION.test(source.relativePath)) continue;

    source.lines.forEach((line, index) => {
      scannedLines += 1;
      if (isComment(line)) return;

      const match = line.match(SECRET_KEY);
      if (match) {
        const value = match[3] ?? match[4];
        const isConfigurationValue = CONFIG_EXTENSION.test(source.relativePath);
        const isSyntheticSentinel = value === SYNTHETIC_SENTINEL;
        if (
          (match[2] || isConfigurationValue) &&
          (isSyntheticSentinel || !isSafeLiteral(value, line))
        ) {
          findings.push(
            createFinding(context, {
              ruleId: "SEC-HARDCODED-CREDENTIAL",
              category: "Security",
              severity: isSyntheticSentinel ? "LOW" : "HIGH",
              title: isSyntheticSentinel
                ? "Synthetic credential sentinel is present"
                : "Credential-like literal is committed in source",
              affectedFile: source.relativePath,
              startLine: index + 1,
              explanation: isSyntheticSentinel
                ? "This exact, documented fake sentinel is reported only to exercise the baseline detector; it is not a usable credential."
                : "A credential-like key is assigned a non-placeholder literal rather than an environment reference.",
              risk: isSyntheticSentinel
                ? "No real secret is exposed; the marker exists solely for the safe demo baseline."
                : "A committed credential may be exposed to repository readers and reused outside the demo.",
              recommendedFix: isSyntheticSentinel
                ? "Remove the sentinel or replace it with an environment reference when remediating the baseline."
                : "Remove the literal and load the value from an environment variable; rotate it if it was ever real.",
              remediationHint: isSyntheticSentinel
                ? "Ask IBM Bob to replace the synthetic marker with an environment reference, never with a real secret."
                : "Ask IBM Bob to verify the value is not a synthetic fixture before replacing it.",
              confidence: isSyntheticSentinel ? 1 : 0.86,
            }),
          );
        }
      }

      if (
        CONFIG_EXTENSION.test(source.relativePath) &&
        /(?:logging\.level(?:\.[\w.-]+)?|log_level|loglevel)\s*[:=]\s*["']?DEBUG\b/i.test(line)
      ) {
        findings.push(
          createFinding(context, {
            ruleId: "SEC-DEBUG-LOGGING",
            category: "Security",
            severity: "MEDIUM",
            title: "DEBUG logging is enabled in configuration",
            affectedFile: source.relativePath,
            startLine: index + 1,
            explanation: "A checked-in configuration sets a logger to DEBUG. This rule does not infer that request bodies or credentials are logged.",
            risk: "Verbose logs can retain more operational data than intended when this configuration is active.",
            recommendedFix: "Use INFO or WARN as the default and enable DEBUG only in an explicitly selected local profile.",
            remediationHint: "Ask IBM Bob to check active profiles and ensure sensitive fields are not logged.",
            confidence: 0.96,
          }),
        );
      }
    });
  }

  return {
    findings,
    checks: [
      createCheck({
        id: "security-source-scan",
        category: "Security",
        status: CHECK_STATUS.PASS,
        summary: `Scanned ${scannedLines} source/configuration lines for literal credentials and DEBUG settings; this is not a vulnerability scan.`,
      }),
    ],
  };
}

export function hasEnvironmentReference(value) {
  return ENV_REFERENCE.test(value);
}

export function findDebugLine(source) {
  return findLine(
    source,
    (line) => CONFIG_EXTENSION.test(source.relativePath) && /logging\.level.*=\s*DEBUG\b/i.test(line),
  );
}
