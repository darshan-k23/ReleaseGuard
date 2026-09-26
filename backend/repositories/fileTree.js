import { readdir, lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "target",
  "dist",
]);

const PRIVATE_KEY_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".pkcs12",
  ".pfx",
  ".p12",
]);

export function isPrivateKeyFileName(fileName) {
  const lower = fileName.toLowerCase();
  for (const ext of PRIVATE_KEY_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  if (
    lower === "id_rsa" ||
    lower.startsWith("id_rsa.") ||
    lower === "id_dsa" ||
    lower.startsWith("id_dsa.") ||
    lower === "id_ecdsa" ||
    lower.startsWith("id_ecdsa.") ||
    lower === "id_ed25519" ||
    lower.startsWith("id_ed25519.") ||
    lower.includes("private_key") ||
    lower.includes("privatekey")
  ) {
    return true;
  }
  return false;
}

export function isExcludedFile(fileName) {
  // .env and .env.*
  if (fileName === ".env" || fileName.startsWith(".env.")) {
    return true;
  }
  // private key files
  if (isPrivateKeyFileName(fileName)) {
    return true;
  }
  return false;
}

export async function hasPrivateKeyContent(filePath) {
  try {
    const buffer = Buffer.alloc(1024);
    const fd = await open(filePath, "r");
    const { bytesRead } = await fd.read(buffer, 0, 1024, 0);
    await fd.close();
    const content = buffer.toString("utf8", 0, bytesRead);
    return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content);
  } catch {
    return false;
  }
}

/**
 * Traverses the workspace safely and builds a repository file tree.
 * Guarantees no exposure of .git internals, node_modules, target, dist, .env, .env.*,
 * or private key files. Prevents symlink traversal and workspace escape.
 */
export async function getSafeFileTree(workspacePath) {
  const canonicalRoot = await realpath(workspacePath);
  const flatFiles = [];

  async function walk(dirPath, relativeDir, depth = 0) {
    if (depth > 20) return [];

    let entries = [];
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    const treeNodes = [];

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue; // Ignore symlinks to prevent escape

      const name = entry.name;
      const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
      const absolutePath = path.resolve(dirPath, name);

      // Verify canonical path remains inside canonical workspace root
      let verified;
      try {
        verified = await realpath(absolutePath);
      } catch {
        continue;
      }

      const relToRoot = path.relative(canonicalRoot, verified);
      if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
        continue; // Path escaped root
      }

      if (entry.isDirectory()) {
        // Exclude .git internals, node_modules, target, dist
        if (EXCLUDED_DIRS.has(name) || name === ".git" || name.startsWith(".git")) {
          continue;
        }

        const children = await walk(verified, relativePath, depth + 1);
        treeNodes.push({
          name,
          path: relativePath,
          type: "directory",
          children,
        });
      } else if (entry.isFile()) {
        if (isExcludedFile(name)) {
          continue;
        }

        if (await hasPrivateKeyContent(verified)) {
          continue;
        }

        let size = 0;
        try {
          const st = await lstat(verified);
          size = st.size;
        } catch {
          //
        }

        flatFiles.push(relativePath);
        treeNodes.push({
          name,
          path: relativePath,
          type: "file",
          size,
        });
      }
    }

    return treeNodes;
  }

  const tree = await walk(canonicalRoot, "", 0);

  return {
    files: flatFiles,
    tree,
    fileCount: flatFiles.length,
  };
}
