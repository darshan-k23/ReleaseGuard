import { createCheck, CHECK_STATUS } from "../types.js";
import { createFinding, findLine } from "../utils/evidence.js";

const API_BASE_PATTERN = /(?:API_BASE|VITE_API_URL|API_URL)\s*=\s*["'`]([^"'`]+)["'`]/;
const SERVER_PORT_PATTERN = /^\s*server\.port\s*[:=]\s*(\d+)/m;

export function runIntegrationRule(context) {
  const findings = [];
  const frontendSource = context.files.find((file) =>
    /(?:^|\/)(?:frontend\/)?src\/api\/client\.[cm]?[jt]sx?$/i.test(file.relativePath) ||
    /(?:^|\/)api\/client\.[cm]?[jt]sx?$/i.test(file.relativePath) ||
    context.files.some(() => API_BASE_PATTERN.test(file.text)),
  );
  const backendConfiguration = context.files.find((file) =>
    /(?:^|\/)application(?:-[\w-]+)?\.(?:properties|ya?ml)$/i.test(file.relativePath) &&
    SERVER_PORT_PATTERN.test(file.text),
  ) || context.files.find((file) =>
    /(?:^|\/)backend\/src\/main\/resources\/application\.(?:properties|ya?ml)$/i.test(file.relativePath),
  );

  const apiLine = frontendSource
    ? findLine(frontendSource, (line) => API_BASE_PATTERN.test(line))
    : null;
  const serverLine = backendConfiguration
    ? findLine(backendConfiguration, (line) => SERVER_PORT_PATTERN.test(line))
    : null;
  const apiText = apiLine ? frontendSource.lines[apiLine - 1] : "";
  const apiMatch = apiText.match(API_BASE_PATTERN);
  const serverText = serverLine ? backendConfiguration.lines[serverLine - 1] : "";
  const serverMatch = serverText.match(SERVER_PORT_PATTERN);

  if (apiMatch && serverMatch) {
    let apiPort = null;
    try {
      apiPort = new URL(apiMatch[1]).port || "80";
    } catch {
      apiPort = null;
    }
    const backendPort = serverMatch[1];

    if (apiPort && apiPort !== backendPort) {
      findings.push(
        createFinding(context, {
          ruleId: "INT-API-PORT-MISMATCH",
          category: "Integration",
          severity: "HIGH",
          title: "Frontend API port does not match the backend port",
          affectedFile: frontendSource.relativePath,
          startLine: apiLine,
          relatedEvidence: [
            {
              affectedFile: backendConfiguration.relativePath,
              startLine: serverLine,
            },
          ],
          explanation: `The frontend API base uses port ${apiPort}, while the backend is configured for port ${backendPort}.`,
          risk: "Browser API requests are sent to a different port than the ShopSphere server listens on.",
          recommendedFix: "Use the backend's configured port or provide one shared, environment-specific API base URL.",
          remediationHint: "Ask IBM Bob to align the API base with the intended local and deployed routing configuration.",
          confidence: 0.99,
        }),
      );
    }
  }

  return {
    findings,
    checks: [
      createCheck({
        id: "frontend-backend-port-comparison",
        category: "Integration",
        status: apiMatch && serverMatch ? CHECK_STATUS.PASS : CHECK_STATUS.NOT_RUN,
        summary:
          apiMatch && serverMatch
            ? "Compared the frontend API base port with server.port."
            : "Could not locate both the frontend API base and backend server port.",
        reason: apiMatch && serverMatch ? null : "Required source setting is missing",
      }),
    ],
  };
}
