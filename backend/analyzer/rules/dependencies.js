import { createCheck, CHECK_STATUS } from "../types.js";
import { createFinding, findLine } from "../utils/evidence.js";

const VERSION_RANGE = /^(?:\^|~|\*|latest$|[<>])/i;

function parsePackageManifest(source) {
  try {
    return JSON.parse(source.text);
  } catch {
    return null;
  }
}

function matchingLockfile(context, manifestPath) {
  const directory = manifestPath.includes("/")
    ? manifestPath.slice(0, manifestPath.lastIndexOf("/"))
    : "";
  const prefix = directory ? `${directory}/` : "";
  return context.byPath.get(`${prefix}package-lock.json`) || null;
}

function rangeDependencies(manifest) {
  return ["dependencies", "devDependencies", "optionalDependencies"]
    .flatMap((section) =>
      Object.entries(manifest[section] || {}).map(([name, version]) => ({
        name,
        version,
      })),
    )
    .filter((dependency) => VERSION_RANGE.test(dependency.version));
}

export function runDependenciesRule(context) {
  const findings = [];
  const manifests = context.files.filter((file) => file.relativePath.endsWith("package.json"));
  const locks = context.files.filter((file) => file.relativePath.endsWith("package-lock.json"));
  const pomFiles = context.files.filter((file) => file.relativePath.endsWith("pom.xml"));
  const inventory = [];
  let parseFailures = 0;

  for (const manifest of manifests) {
    const parsed = parsePackageManifest(manifest);
    if (!parsed || typeof parsed !== "object") {
      parseFailures += 1;
      const lineNumber = findLine(manifest, (line) => line.trim().length > 0);
      if (lineNumber) {
        findings.push(
          createFinding(context, {
            ruleId: "DEP-PACKAGE-MANIFEST-INVALID",
            category: "Dependencies",
            severity: "HIGH",
            title: "package.json could not be parsed",
            affectedFile: manifest.relativePath,
            startLine: lineNumber,
            explanation: "The dependency manifest is not valid JSON and its dependency declarations could not be reviewed.",
            risk: "Install and build behavior may be inconsistent or fail.",
            recommendedFix: "Correct the JSON syntax and re-run the project package manager.",
            remediationHint: "Ask IBM Bob to repair the manifest without adding unrelated packages.",
            confidence: 1,
          }),
        );
      }
      continue;
    }

    const ranges = rangeDependencies(parsed);
    inventory.push({
      file: manifest.relativePath,
      name: parsed.name || "unnamed package",
      dependencyCount: Object.keys(parsed.dependencies || {}).length + Object.keys(parsed.devDependencies || {}).length,
      hasLockfile: Boolean(matchingLockfile(context, manifest.relativePath)),
    });

    if (!matchingLockfile(context, manifest.relativePath) && ranges.length > 0) {
      const dependency = ranges[0];
      const lineNumber = findLine(
        manifest,
        (line) => line.includes(`"${dependency.name}"`) && line.includes(dependency.version),
      );
      if (lineNumber) {
        findings.push(
          createFinding(context, {
            ruleId: "DEP-NPM-RANGE-WITHOUT-LOCKFILE",
            category: "Dependencies",
            severity: "MEDIUM",
            title: "NPM version ranges are not locked by a lockfile",
            affectedFile: manifest.relativePath,
            startLine: lineNumber,
            explanation: `The manifest uses a floating version range (${dependency.name}: ${dependency.version}) but no adjacent package-lock.json was found. This is a reproducibility warning only.`,
            risk: "Fresh installs may resolve different compatible package versions over time.",
            recommendedFix: "Commit the package manager lockfile and update it deliberately during dependency maintenance.",
            remediationHint: "Ask IBM Bob to generate the lockfile using the intended npm version; do not treat this as a vulnerability finding.",
            confidence: 0.97,
          }),
        );
      }
    }
  }

  for (const lockfile of locks) {
    try {
      JSON.parse(lockfile.text);
    } catch {
      parseFailures += 1;
      const lineNumber = findLine(lockfile, (line) => line.trim().length > 0);
      if (lineNumber) {
        findings.push(
          createFinding(context, {
            ruleId: "DEP-NPM-LOCKFILE-INVALID",
            category: "Dependencies",
            severity: "HIGH",
            title: "package-lock.json could not be parsed",
            affectedFile: lockfile.relativePath,
            startLine: lineNumber,
            explanation: "The npm lockfile is not valid JSON.",
            risk: "Dependency installation may not be reproducible.",
            recommendedFix: "Regenerate the lockfile with the repository's declared package manifest.",
            remediationHint: "Ask IBM Bob to regenerate the lockfile and review the resulting dependency changes.",
            confidence: 1,
          }),
        );
      }
    }
  }

  let pomDependencies = 0;
  let pomProjects = 0;
  for (const pom of pomFiles) {
    pomProjects += 1;
    const dependencies = [...pom.text.matchAll(/<dependency\b[\s\S]*?<\/dependency>/g)];
    pomDependencies += dependencies.length;
    if (!/<project\b/.test(pom.text) || !/<artifactId>[^<]+<\/artifactId>/.test(pom.text)) {
      parseFailures += 1;
      const lineNumber = findLine(pom, (line) => /<project\b|<artifactId>/.test(line));
      if (lineNumber) {
        findings.push(
          createFinding(context, {
            ruleId: "DEP-MAVEN-POM-UNREADABLE",
            category: "Dependencies",
            severity: "HIGH",
            title: "Maven project metadata could not be parsed",
            affectedFile: pom.relativePath,
            startLine: lineNumber,
            explanation: "The POM does not contain the expected project and artifact metadata.",
            risk: "The backend's declared dependencies and build identity could not be reviewed.",
            recommendedFix: "Repair the POM structure and run Maven validation.",
            remediationHint: "Ask IBM Bob to validate the POM using the installed Maven tool.",
            confidence: 0.95,
          }),
        );
      }
    }
  }

  return {
    findings,
    checks: [
      createCheck({
        id: "dependency-manifest-review",
        category: "Dependencies",
        status: parseFailures ? CHECK_STATUS.FAIL : CHECK_STATUS.PASS,
        summary: `Parsed ${manifests.length} package.json file(s), ${locks.length} package-lock.json file(s), and ${pomProjects} pom.xml file(s) with ${pomDependencies} Maven dependency declarations. No live vulnerability database was queried.`,
        reason: parseFailures ? `${parseFailures} manifest(s) could not be parsed` : null,
      }),
    ],
    inventory,
  };
}

export const dependencyMaintenancePolicy =
  "Static demo policy: warn on NPM semver ranges only when the package has no adjacent package-lock.json; parse package.json, package-lock.json, and pom.xml; do not infer age or CVEs from version numbers and do not query a vulnerability database.";
