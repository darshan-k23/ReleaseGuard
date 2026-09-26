import { createCheck, CHECK_STATUS } from "../types.js";
import { createFinding, findLine } from "../utils/evidence.js";
import { hasEnvironmentReference } from "./security.js";

const CONFIG_PATH = /(^|\/)application(?:-[\w-]+)?\.(?:properties|ya?ml)$/i;
const PRODUCTION_PROFILE = /(^|\/)application-(?:prod|production)\.(?:properties|ya?ml)$/i;

function valueFromLine(line) {
  const separator = line.search(/[:=]/);
  return separator < 0 ? "" : line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
}

export function runConfigurationRule(context) {
  const findings = [];
  const configurations = context.files.filter((file) => CONFIG_PATH.test(file.relativePath));
  const productionProfileExists = context.files.some((file) =>
    PRODUCTION_PROFILE.test(file.relativePath),
  );
  const mainConfiguration = configurations.find((file) =>
    /(^|\/)application\.(?:properties|ya?ml)$/i.test(file.relativePath),
  );

  if (mainConfiguration && !productionProfileExists) {
    const lineNumber = findLine(
      mainConfiguration,
      (line) => /^\s*(?:server\.port|spring\.application\.name)\s*[:=]/.test(line),
    );
    if (lineNumber) {
      findings.push(
        createFinding(context, {
          ruleId: "CFG-MISSING-PRODUCTION-PROFILE",
          category: "Configuration",
          severity: "MEDIUM",
          title: "No production-specific configuration profile is present",
          affectedFile: mainConfiguration.relativePath,
          startLine: lineNumber,
          explanation: "No application-prod or application-production configuration file was found beside the default configuration.",
          risk: "Local defaults may be reused unintentionally when a production environment is introduced.",
          recommendedFix: "Add an explicit production profile and externalize environment-specific settings before deployment.",
          remediationHint: "Ask IBM Bob to inspect the deployment target and document the expected profile activation.",
          confidence: 0.93,
        }),
      );
    }
  }

  for (const source of configurations) {
    source.lines.forEach((line, index) => {
      if (/^\s*(?:#|\/\/)/.test(line)) return;
      if (!/^\s*spring\.datasource\.(?:url|username|password)\s*[:=]/i.test(line)) return;
      const value = valueFromLine(line);
      if (!value || hasEnvironmentReference(value)) return;

      const hasRemoteHost = /(?:jdbc:[a-z0-9]+:.*\/\/|https?:\/\/)([^/:?#]+)/i.exec(value);
      if (!hasRemoteHost || /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(hasRemoteHost[1])) return;

      findings.push(
        createFinding(context, {
          ruleId: "CFG-NONEXTERNALIZED-DATASOURCE",
          category: "Configuration",
          severity: "HIGH",
          title: "Environment-specific datasource host is hardcoded",
          affectedFile: source.relativePath,
          startLine: index + 1,
          explanation: "The datasource URL names a fixed non-local host instead of using an environment reference.",
          risk: "The checked-in endpoint can couple the demo to an unintended environment and exposes deployment topology.",
          recommendedFix: "Make the datasource URL a profile-specific environment value; keep all credentials out of source.",
          remediationHint: "Ask IBM Bob to decide whether this database is in scope; the ReleaseGuard demo itself does not require a database.",
          confidence: 0.92,
        }),
      );
    });
  }

  if (!productionProfileExists) {
    for (const source of configurations) {
      source.lines.forEach((line, index) => {
        if (/^\s*(?:#|\/\/)/.test(line)) return;
        if (!/^\s*spring\.jpa\.hibernate\.ddl-auto\s*[:=]\s*update\s*$/i.test(line)) return;

        findings.push(
          createFinding(context, {
            ruleId: "CFG-DEVELOPMENT-DDL-DEFAULT",
            category: "Configuration",
            severity: "MEDIUM",
            title: "Schema auto-update is enabled in the default configuration",
            affectedFile: source.relativePath,
            startLine: index + 1,
            explanation: "Hibernate schema updates are enabled in the default configuration and no production profile was found.",
            risk: "Automatic schema changes may be unsuitable when this configuration is reused outside local development.",
            recommendedFix: "Use an explicit migration strategy and disable automatic schema updates in production.",
            remediationHint: "Ask IBM Bob to verify whether persistence is needed for this database-free sample.",
            confidence: 0.9,
          }),
        );
      });
    }
  }

  return {
    findings,
    checks: [
      createCheck({
        id: "configuration-source-scan",
        category: "Configuration",
        status: CHECK_STATUS.PASS,
        summary: `Inspected ${configurations.length} Spring configuration file(s) for profiles and fixed datasource values.`,
      }),
    ],
  };
}
