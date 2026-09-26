import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

export const ECOSYSTEM_STATUS = {
  EXECUTABLE: "EXECUTABLE",
  NOT_RUN: "NOT_RUN",
};

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "target",
  "dist",
  "build",
  "coverage",
  ".next",
  "vendor",
  "venv",
  ".venv",
  "env",
  "__pycache__",
  ".gradle",
  ".m2",
  ".idea",
  ".vscode",
]);

const MAX_SCAN_DEPTH = 4;

/**
 * Detects project ecosystems, build manifests, package managers, and candidate build/test commands.
 *
 * Supported ecosystems:
 *   - Node (package.json) -> EXECUTABLE
 *   - Maven (pom.xml) -> EXECUTABLE
 *   - Gradle (build.gradle, build.gradle.kts) -> NOT_RUN
 *   - Python (pyproject.toml, requirements.txt) -> NOT_RUN
 *   - Go (go.mod) -> NOT_RUN
 *   - Rust (Cargo.toml) -> NOT_RUN
 *
 * @param {string} rootPath Absolute path to the workspace root directory.
 * @returns {Promise<Array<object>>} List of detected ecosystems.
 */
export async function detectStack(rootPath) {
  const canonicalRoot = await realpath(rootPath);
  const detected = [];

  async function scanDirectory(currentPath, relativeDir = "", depth = 0) {
    if (depth > MAX_SCAN_DEPTH) return;

    let entries = [];
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    const fileNames = new Set();
    const subDirs = [];

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue; // Ignore symlinks to prevent loops/escape

      if (entry.isFile()) {
        fileNames.add(entry.name);
      } else if (
        entry.isDirectory() &&
        !SKIPPED_DIRECTORIES.has(entry.name) &&
        !entry.name.startsWith(".")
      ) {
        subDirs.push(entry.name);
      }
    }

    const toRelativePath = (fileName) =>
      relativeDir ? `${relativeDir}/${fileName}` : fileName;

    // 1. Node (package.json)
    if (fileNames.has("package.json")) {
      let packageManager = "npm";
      if (fileNames.has("pnpm-lock.yaml")) {
        packageManager = "pnpm";
      } else if (fileNames.has("yarn.lock")) {
        packageManager = "yarn";
      } else if (fileNames.has("package-lock.json")) {
        packageManager = "npm";
      }

      const buildCandidates = [];
      const testCandidates = [];

      try {
        const rawContent = await readFile(path.join(currentPath, "package.json"), "utf8");
        const parsed = JSON.parse(rawContent);

        if (typeof parsed.packageManager === "string") {
          const pmName = parsed.packageManager.split("@")[0].trim().toLowerCase();
          if (["npm", "yarn", "pnpm"].includes(pmName)) {
            packageManager = pmName;
          }
        }

        const scripts = parsed.scripts || {};
        if (typeof scripts.build === "string") {
          buildCandidates.push("npm run build");
        }
        if (typeof scripts.test === "string") {
          testCandidates.push("npm test");
          testCandidates.push("npm run test");
        }
      } catch {
        // Continue with default empty candidates if package.json cannot be parsed
      }

      detected.push({
        ecosystem: "Node",
        manifest: toRelativePath("package.json"),
        packageManager,
        buildCandidates,
        testCandidates,
        status: ECOSYSTEM_STATUS.EXECUTABLE,
        executionStatus: ECOSYSTEM_STATUS.EXECUTABLE,
      });
    }

    // 2. Maven (pom.xml)
    if (fileNames.has("pom.xml")) {
      detected.push({
        ecosystem: "Maven",
        manifest: toRelativePath("pom.xml"),
        packageManager: "mvn",
        buildCandidates: ["mvn package -DskipTests"],
        testCandidates: ["mvn test"],
        status: ECOSYSTEM_STATUS.EXECUTABLE,
        executionStatus: ECOSYSTEM_STATUS.EXECUTABLE,
      });
    }

    // 3. Gradle (build.gradle, build.gradle.kts)
    const gradleManifest = fileNames.has("build.gradle")
      ? "build.gradle"
      : fileNames.has("build.gradle.kts")
        ? "build.gradle.kts"
        : null;

    if (gradleManifest) {
      const packageManager = fileNames.has("gradlew") || fileNames.has("gradlew.bat")
        ? "gradlew"
        : "gradle";

      detected.push({
        ecosystem: "Gradle",
        manifest: toRelativePath(gradleManifest),
        packageManager,
        buildCandidates: ["gradle build -x test"],
        testCandidates: ["gradle test"],
        status: ECOSYSTEM_STATUS.NOT_RUN,
        executionStatus: ECOSYSTEM_STATUS.NOT_RUN,
      });
    }

    // 4. Python (pyproject.toml, requirements.txt)
    const pythonManifest = fileNames.has("pyproject.toml")
      ? "pyproject.toml"
      : fileNames.has("requirements.txt")
        ? "requirements.txt"
        : null;

    if (pythonManifest) {
      let packageManager = "pip";
      if (fileNames.has("pyproject.toml")) {
        try {
          const pyproject = await readFile(path.join(currentPath, "pyproject.toml"), "utf8");
          if (pyproject.includes("[tool.poetry]")) {
            packageManager = "poetry";
          }
        } catch {
          //
        }
      } else if (fileNames.has("Pipfile")) {
        packageManager = "pipenv";
      }

      detected.push({
        ecosystem: "Python",
        manifest: toRelativePath(pythonManifest),
        packageManager,
        buildCandidates: [],
        testCandidates: ["pytest"],
        status: ECOSYSTEM_STATUS.NOT_RUN,
        executionStatus: ECOSYSTEM_STATUS.NOT_RUN,
      });
    }

    // 5. Go (go.mod)
    if (fileNames.has("go.mod")) {
      detected.push({
        ecosystem: "Go",
        manifest: toRelativePath("go.mod"),
        packageManager: "go",
        buildCandidates: ["go build ./..."],
        testCandidates: ["go test ./..."],
        status: ECOSYSTEM_STATUS.NOT_RUN,
        executionStatus: ECOSYSTEM_STATUS.NOT_RUN,
      });
    }

    // 6. Rust (Cargo.toml)
    if (fileNames.has("Cargo.toml")) {
      detected.push({
        ecosystem: "Rust",
        manifest: toRelativePath("Cargo.toml"),
        packageManager: "cargo",
        buildCandidates: ["cargo build"],
        testCandidates: ["cargo test"],
        status: ECOSYSTEM_STATUS.NOT_RUN,
        executionStatus: ECOSYSTEM_STATUS.NOT_RUN,
      });
    }

    // Recursively scan subdirectories
    subDirs.sort((a, b) => a.localeCompare(b));
    for (const subDir of subDirs) {
      const subDirPath = path.join(currentPath, subDir);
      const subRelativeDir = relativeDir ? `${relativeDir}/${subDir}` : subDir;
      await scanDirectory(subDirPath, subRelativeDir, depth + 1);
    }
  }

  await scanDirectory(canonicalRoot);

  detected.sort((a, b) => a.manifest.localeCompare(b.manifest));
  return detected;
}
