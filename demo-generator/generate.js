import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const DEMO_REPOSITORIES_ROOT = path.resolve(currentDir, "..", "demo-repositories");

/**
 * Common base template files generator
 */
function createBaseFiles({
  name = "demo-app",
  port = 8080,
  apiPort = 8080,
  includeProdProfile = true,
  includeDeploymentDoc = true,
  includeLockfile = true,
  debugLogging = false,
  secretPassword = null,
  datasourceUrl = null,
  ddlAuto = null,
  failingTest = false,
  failingBuild = false,
  unlockedRange = false,
  readmeDetails = "",
} = {}) {
  const files = {};

  // package.json
  const optionalDependencies = unlockedRange
    ? { "unlocked-demo-package": "^1.0.0" }
    : {};

  files["package.json"] = JSON.stringify(
    {
      name,
      version: "1.0.0",
      description: `ReleaseGuard demo repository - ${name}`,
      main: "src/server.js",
      type: "module",
      scripts: {
        start: "node src/server.js",
        build: "node scripts/build.js",
        test: "node --test",
      },
      dependencies: {},
      ...(unlockedRange ? { optionalDependencies } : {}),
    },
    null,
    2,
  ) + "\n";

  // package-lock.json
  if (includeLockfile) {
    files["package-lock.json"] = JSON.stringify(
      {
        name,
        version: "1.0.0",
        lockfileVersion: 3,
        requires: true,
        packages: {
          "": {
            name,
            version: "1.0.0",
            dependencies: {},
            ...(unlockedRange ? { optionalDependencies } : {}),
          },
        },
      },
      null,
      2,
    ) + "\n";
  }

  // src/server.js
  files["src/server.js"] = `import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = process.env.PORT || ${port};

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "${name}", port: PORT }));
});

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === currentFile) {
  server.listen(PORT, () => {
    console.log(\`Server listening on http://localhost:\${PORT}\`);
  });
}

export default server;
`;

  // src/api/client.js
  files["src/api/client.js"] = `export const API_BASE = "http://localhost:${apiPort}";

export async function fetchHealth() {
  const res = await fetch(\`\${API_BASE}/health\`);
  return res.json();
}
`;

  // scripts/build.js
  if (failingBuild) {
    files["scripts/build.js"] = `console.error("Build failed: intentional synthetic compilation error.");
process.exit(1);
`;
  } else {
    files["scripts/build.js"] = `console.log("Building ${name} production bundle...");
console.log("Build completed successfully.");
process.exit(0);
`;
  }

  // test/server.test.js
  if (failingTest) {
    files["test/server.test.js"] = `import test from "node:test";
import assert from "node:assert/strict";

test("server health test", () => {
  assert.strictEqual("FAIL", "PASS", "Intentional deterministic test failure for demo");
});
`;
  } else {
    files["test/server.test.js"] = `import test from "node:test";
import assert from "node:assert/strict";
import server from "../src/server.js";

test("server module exports valid server", () => {
  assert.ok(server);
});
`;
  }

  // application.properties
  const propLines = [
    `server.port=${port}`,
    `spring.application.name=${name}`,
  ];
  if (debugLogging) {
    propLines.push("logging.level.root=DEBUG");
  }
  if (secretPassword) {
    propLines.push(`spring.datasource.password=${secretPassword}`);
  }
  if (datasourceUrl) {
    propLines.push(`spring.datasource.url=${datasourceUrl}`);
  }
  if (ddlAuto) {
    propLines.push(`spring.jpa.hibernate.ddl-auto=${ddlAuto}`);
  }
  files["application.properties"] = propLines.join("\n") + "\n";

  // application-prod.properties
  if (includeProdProfile) {
    files["application-prod.properties"] = [
      `server.port=\${PORT:${port}}`,
      `spring.application.name=${name}`,
      "logging.level.root=INFO",
    ].join("\n") + "\n";
  }

  // DEPLOYMENT.md
  if (includeDeploymentDoc) {
    files["DEPLOYMENT.md"] = `# Deployment & Operations Guide

## Production Deployment & Release Procedure
1. Verify all tests pass: \`npm test\`
2. Build distributable bundle: \`npm run build\`
3. Deploy to production environment with required profile:
   \`\`\`bash
   NODE_ENV=production npm start
   \`\`\`
`;
  }

  // README.md
  files["README.md"] = `# ${name}

ReleaseGuard Demo Repository

## Build & Run
Run production build:
\`\`\`bash
npm run build
\`\`\`

Run test suite:
\`\`\`bash
npm test
\`\`\`

## Configuration
Configure through environment settings and environment variables:
- \`PORT\`: HTTP listen port (default ${port})
- Profile activation via \`application.properties\`

${includeDeploymentDoc ? "See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment and release procedure." : ""}

## Intentional Baseline Conditions
${readmeDetails}
`;

  return files;
}

/**
 * Specifications for the 6 demo repositories
 */
const REPOSITORY_SPECS = [
  {
    name: "release-ready",
    description: "Clean, verified release candidate meeting all gates",
    config: {
      name: "release-ready-service",
      port: 8080,
      apiPort: 8080,
      includeProdProfile: true,
      includeDeploymentDoc: true,
      includeLockfile: true,
      debugLogging: false,
      secretPassword: null,
      datasourceUrl: null,
      failingTest: false,
      failingBuild: false,
      unlockedRange: false,
      readmeDetails: `This repository is a clean release candidate:
- All unit and build tests pass deterministically
- Configuration is properly externalized with an explicit production profile
- Frontend API client port (8080) aligns with the backend server port (8080)
- Deployment guide and release procedures are fully documented in DEPLOYMENT.md
- Dependencies are locked with package-lock.json`,
    },
    characteristics: [
      "Clean Node.js application",
      "Passing builds and unit tests",
      "Complete deployment and release documentation",
      "Externalized configuration with production profile",
      "Locked dependency manifest",
    ],
  },
  {
    name: "warning-only",
    description: "Repository with non-blocking maintenance and documentation warnings",
    config: {
      name: "warning-only-service",
      port: 8080,
      apiPort: 8080,
      includeProdProfile: true,
      includeDeploymentDoc: false, // Triggers DOC-DEPLOYMENT-RELEASE-PROCEDURE-MISSING
      includeLockfile: false, // Triggers DEP-NPM-RANGE-WITHOUT-LOCKFILE
      unlockedRange: true,
      debugLogging: false,
      failingTest: false,
      readmeDetails: `Intentional baseline conditions:
- Missing deployment documentation: No DEPLOYMENT.md or release procedure documentation
- Dependency maintenance warning: Uses floating semver range (^4.19.2) without package-lock.json
- All builds and tests pass cleanly without blocker errors`,
    },
    characteristics: [
      "Missing deployment and release documentation (Warning)",
      "Unlocked npm dependency range without lockfile (Warning)",
      "Passing builds and tests (No release blockers)",
    ],
  },
  {
    name: "configuration-risk",
    description: "Repository with integration port mismatch and missing production profile",
    config: {
      name: "configuration-risk-service",
      port: 8080,
      apiPort: 3000, // Port mismatch: frontend uses 3000, backend uses 8080
      includeProdProfile: false, // Triggers CFG-MISSING-PRODUCTION-PROFILE
      includeDeploymentDoc: true,
      includeLockfile: true,
      ddlAuto: "update", // Triggers CFG-DEVELOPMENT-DDL-DEFAULT
      debugLogging: false,
      failingTest: false,
      readmeDetails: `Intentional baseline conditions:
- Integration port mismatch: Frontend API client targets port 3000 while backend listens on port 8080
- Missing production profile: No application-prod.properties file present
- Schema auto-update: Development DDL update enabled in default configuration`,
    },
    characteristics: [
      "Frontend API port mismatch (port 3000 vs backend 8080)",
      "Missing production configuration profile",
      "Development DDL auto-update default",
    ],
  },
  {
    name: "security-blocked",
    description: "Repository containing committed synthetic secrets and DEBUG logging",
    config: {
      name: "security-blocked-service",
      port: 8080,
      apiPort: 8080,
      includeProdProfile: true,
      includeDeploymentDoc: true,
      includeLockfile: true,
      secretPassword: "demo-only-not-a-secret", // Obvious synthetic secret sentinel
      debugLogging: true, // Triggers SEC-DEBUG-LOGGING
      failingTest: false,
      readmeDetails: `Intentional baseline conditions:
- Synthetic credential sentinel: Checked-in password literal ('demo-only-not-a-secret')
- Verbose logging: DEBUG logging enabled in application.properties`,
    },
    characteristics: [
      "Committed synthetic credential sentinel (demo-only-not-a-secret)",
      "DEBUG logging enabled in configuration",
    ],
  },
  {
    name: "test-failing",
    description: "Repository with failing deterministic tests and validation",
    config: {
      name: "test-failing-service",
      port: 8080,
      apiPort: 8080,
      includeProdProfile: true,
      includeDeploymentDoc: true,
      includeLockfile: true,
      failingTest: true, // Deterministic test assertion failure
      debugLogging: false,
      readmeDetails: `Intentional baseline conditions:
- Deterministic test failure: 'npm test' fails assertion
- Blocks release evaluation gate via execution validation`,
    },
    characteristics: [
      "Deterministic test failure in test runner",
      "Blocks release gate through validation failure",
    ],
  },
  {
    name: "critically-blocked",
    description: "Repository with multiple compound blockers across security, config, and validation",
    config: {
      name: "critically-blocked-service",
      port: 8080,
      apiPort: 9000, // Integration mismatch
      includeProdProfile: false, // Config risk
      includeDeploymentDoc: false, // Doc missing
      includeLockfile: false, // Dep warning
      unlockedRange: true,
      secretPassword: "demo-only-not-a-secret", // Security blocker
      datasourceUrl: "jdbc:postgresql://db.internal.production.net:5432/shop", // Remote host config blocker
      debugLogging: true,
      failingTest: true, // Test validation blocker
      readmeDetails: `Intentional baseline conditions:
- Multiple compound blockers:
  1. Synthetic credential in configuration
  2. Fixed remote production datasource host
  3. Integration port mismatch (9000 vs 8080)
  4. Missing production profile and deployment documentation
  5. Failing automated test suite`,
    },
    characteristics: [
      "Multiple compound blockers (synthetic secret, port mismatch, remote datasource host, failing test)",
    ],
  },
];

/**
 * Main generator execution function
 */
export async function generateDemoRepositories(targetRoot = DEMO_REPOSITORIES_ROOT) {
  console.log(`Generating demo repositories into: ${targetRoot}\n`);

  for (const spec of REPOSITORY_SPECS) {
    const repoPath = path.join(targetRoot, spec.name);
    await rm(repoPath, { recursive: true, force: true });
    await mkdir(repoPath, { recursive: true });

    const files = createBaseFiles(spec.config);

    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = path.join(repoPath, relPath);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf8");
    }
  }

  console.log("================================================================================");
  console.log("Generated Demo Repositories:");
  console.log("================================================================================");

  for (const spec of REPOSITORY_SPECS) {
    console.log(`\nRepository: ${spec.name}`);
    console.log("Expected Characteristics:");
    for (const char of spec.characteristics) {
      console.log(`  - ${char}`);
    }
  }
  console.log("\n================================================================================");
}

// Auto-run if executed directly
const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === currentFile) {
  generateDemoRepositories().catch((err) => {
    console.error("Generator failed:", err);
    process.exit(1);
  });
}
