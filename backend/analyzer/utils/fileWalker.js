import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  "coverage",
  ".next",
  "logs",
]);
const SKIPPED_RELATIVE_PATHS = new Set([".github/modernize"]);
const MAX_FILES = 5000;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DEPTH = 16;

function isWithinRoot(root, candidate) {
  return candidate.startsWith(`${root}${path.sep}`);
}

export function resolveProjectFile(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath.includes("\0")) {
    throw new TypeError("A valid project-relative path is required");
  }

  const portablePath = relativePath.replaceAll("\\", "/");
  if (
    path.isAbsolute(relativePath) ||
    portablePath.split("/").some((segment) => segment === "..")
  ) {
    throw new Error("Path must remain inside the demo repository");
  }

  const canonicalRoot = path.resolve(root);
  const candidate = path.resolve(canonicalRoot, portablePath);
  if (!isWithinRoot(canonicalRoot, candidate)) {
    throw new Error("Path must remain inside the demo repository");
  }
  return candidate;
}

export async function walkProject(root) {
  const requestedRoot = path.resolve(root);
  const canonicalRoot = await realpath(requestedRoot);
  const normalizedRoot = process.platform === "win32"
    ? requestedRoot.toLowerCase()
    : requestedRoot;
  const normalizedCanonicalRoot = process.platform === "win32"
    ? path.resolve(canonicalRoot).toLowerCase()
    : path.resolve(canonicalRoot);
  if (normalizedRoot !== normalizedCanonicalRoot) {
    throw new Error("Project root must not resolve through a symbolic link");
  }
  const files = [];

  async function visit(directory, relativeDirectory, depth) {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      if (entry.isSymbolicLink()) continue;

      const relativePath = [relativeDirectory, entry.name]
        .filter(Boolean)
        .join("/");
      if (
        entry.isDirectory() &&
        (SKIPPED_DIRECTORIES.has(entry.name) ||
          [...SKIPPED_RELATIVE_PATHS].some((skippedPath) =>
            relativePath === skippedPath || relativePath.startsWith(`${skippedPath}/`),
          ))
      ) continue;
      const absolutePath = resolveProjectFile(canonicalRoot, relativePath);

      let metadata;
      let verifiedPath;
      try {
        metadata = await lstat(absolutePath);
        if (metadata.isSymbolicLink()) continue;
        verifiedPath = await realpath(absolutePath);
      } catch {
        continue;
      }
      if (!isWithinRoot(canonicalRoot, verifiedPath)) continue;

      if (metadata.isDirectory()) {
        await visit(verifiedPath, relativePath, depth + 1);
        continue;
      }
      if (!metadata.isFile() || /\.(?:log|class|jar|png|jpe?g|gif|webp|zip)$/i.test(entry.name)) continue;
      if (metadata.size > MAX_FILE_BYTES) continue;
      const text = await readFile(verifiedPath, "utf8");
      if (text.includes("\0")) continue;

      files.push({
        absolutePath,
        relativePath: relativePath.replaceAll(path.sep, "/"),
        text,
        lines: text.split(/\r?\n/),
      });
    }
  }

  await visit(canonicalRoot, "", 0);
  return files;
}

export function isPathInsideRoot(root, candidate) {
  const canonicalRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return isWithinRoot(canonicalRoot, resolvedCandidate);
}
