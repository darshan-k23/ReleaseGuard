import { createCheck, CHECK_STATUS } from "../types.js";
import { createFinding, findLine } from "../utils/evidence.js";

function firstReadme(context) {
  return context.files.find((file) => /(^|\/)README\.md$/i.test(file.relativePath));
}

function containsText(files, pattern) {
  return files.some((file) => pattern.test(file.text));
}

function addMissingTopic(context, findings, readme, definition) {
  const lineNumber = findLine(
    readme,
    definition.evidenceMatcher || ((line) => /^#{1,3}\s+/.test(line)),
  ) || 1;
  const { evidenceMatcher, ...findingDetails } = definition;
  findings.push(
    createFinding(context, {
      ...findingDetails,
      affectedFile: readme.relativePath,
      startLine: lineNumber,
    }),
  );
}

export function runDocumentationRule(context) {
  const findings = [];
  const readme = firstReadme(context);
  if (!readme) {
    return {
      findings,
      checks: [
        createCheck({
          id: "documentation-review",
          category: "Documentation",
          status: CHECK_STATUS.NOT_RUN,
          summary: "No README was found to evaluate documentation coverage.",
          reason: "README missing",
        }),
      ],
    };
  }

  const buildInstructions = /npm\s+run\s+build|mvn\s+(?:-\w+\s+)*(?:package|verify)/i.test(readme.text);
  const configurationInstructions = /(?:environment(?:[- ]variable)?|configuration|profile|SHOPSPHERE_DB_|environment settings)/i.test(readme.text);
  const deploymentDocumentation = context.files.some(
    (file) =>
      /(^|\/)(?:DEPLOYMENT|RELEASE|OPERATIONS)(?:\.md|\/)/i.test(file.relativePath) &&
      /deploy|release|production/i.test(file.text),
  );
  const releaseProcedure = containsText(
    context.files.filter((file) => /README\.md$|DEPLOYMENT\.md$|RELEASE\.md$/i.test(file.relativePath)),
    /(?:release procedure|release steps|production deployment|deploy to production)/i,
  );

  if (!buildInstructions) {
    addMissingTopic(context, findings, readme, {
      ruleId: "DOC-BUILD-INSTRUCTIONS-MISSING",
      category: "Documentation",
      severity: "MEDIUM",
      title: "README does not document production build commands",
      explanation: "The README contains local run instructions but no npm build or Maven package/verify command.",
      risk: "A maintainer may not know how to produce and validate distributable artifacts.",
      recommendedFix: "Document the frontend production build and backend package command, including their expected tools.",
      remediationHint: "Ask IBM Bob to update the documented commands only after confirming the intended build workflow.",
      evidenceMatcher: (line) => /mvn\s+spring-boot:run|npm\s+run\s+dev/i.test(line),
      confidence: 0.95,
    });
  }

  if (!configurationInstructions) {
    addMissingTopic(context, findings, readme, {
      ruleId: "DOC-CONFIGURATION-INSTRUCTIONS-MISSING",
      category: "Documentation",
      severity: "MEDIUM",
      title: "README does not explain required configuration",
      explanation: "No environment variables, configuration files, or profile instructions were found in the README.",
      risk: "Local setup may depend on undocumented configuration assumptions.",
      recommendedFix: "List required non-secret settings and explain how the intended profile is selected.",
      remediationHint: "Ask IBM Bob to document names and safe defaults only; never include real values.",
      confidence: 0.92,
    });
  }

  if (!deploymentDocumentation || !releaseProcedure) {
    addMissingTopic(context, findings, readme, {
      ruleId: "DOC-DEPLOYMENT-RELEASE-PROCEDURE-MISSING",
      category: "Documentation",
      severity: "MEDIUM",
      title: "Deployment and release procedure are not documented",
      explanation: "No deployment guide or production/release procedure was found in the repository documentation.",
      risk: "A future release could rely on unreviewed manual steps or undocumented environment assumptions.",
      recommendedFix: "Add a deployment/release guide that states the supported target and prerequisites; do not imply this demo is production-ready.",
      remediationHint: "Have IBM Bob draft a procedure only after the deployment target and security requirements are known.",
      evidenceMatcher: (line) => /not a production application|intentionally incomplete/i.test(line),
      confidence: 0.94,
    });
  }

  return {
    findings,
    checks: [
      createCheck({
        id: "documentation-review",
        category: "Documentation",
        status: CHECK_STATUS.PASS,
        summary: `Checked README build/configuration instructions and deployment/release documentation.`,
      }),
    ],
  };
}
