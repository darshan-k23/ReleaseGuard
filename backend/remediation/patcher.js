import path from "node:path";
import { readFile, writeFile, access } from "node:fs/promises";

/**
 * Normalizes line endings to \n for uniform processing.
 */
function normalizeEol(str) {
  return str.replace(/\r\n/g, "\n");
}

/**
 * Applies a unified diff, hunk, or line-replacement patch string to file content.
 *
 * @param {string} originalContent
 * @param {string} patchString
 * @param {Object} [options]
 * @returns {string} Modified file content
 */
export function applyPatchToFileContent(originalContent, patchString, options = {}) {
  if (typeof patchString !== "string" || !patchString.trim()) {
    return originalContent;
  }

  const normalizedOriginal = normalizeEol(originalContent);
  const normalizedPatch = normalizeEol(patchString.trim());

  // 1. Try unified diff hunks if @@ headers exist
  if (normalizedPatch.includes("@@")) {
    const lines = normalizedPatch.split("\n");
    let inHunk = false;
    let oldHunkLines = [];
    let newHunkLines = [];
    let currentContent = normalizedOriginal;
    let hunkAppliedCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("@@")) {
        if (inHunk && (oldHunkLines.length > 0 || newHunkLines.length > 0)) {
          const oldBlock = oldHunkLines.join("\n");
          const newBlock = newHunkLines.join("\n");
          if (currentContent.includes(oldBlock)) {
            currentContent = currentContent.replace(oldBlock, newBlock);
            hunkAppliedCount++;
          }
        }
        inHunk = true;
        oldHunkLines = [];
        newHunkLines = [];
        continue;
      }

      if (inHunk) {
        if (line.startsWith("---") || line.startsWith("+++")) {
          continue;
        }
        if (line.startsWith("-")) {
          oldHunkLines.push(line.slice(1));
        } else if (line.startsWith("+")) {
          newHunkLines.push(line.slice(1));
        } else if (line.startsWith(" ")) {
          oldHunkLines.push(line.slice(1));
          newHunkLines.push(line.slice(1));
        } else {
          // Unprefixed context line
          oldHunkLines.push(line);
          newHunkLines.push(line);
        }
      }
    }

    if (inHunk && (oldHunkLines.length > 0 || newHunkLines.length > 0)) {
      const oldBlock = oldHunkLines.join("\n");
      const newBlock = newHunkLines.join("\n");
      if (currentContent.includes(oldBlock)) {
        currentContent = currentContent.replace(oldBlock, newBlock);
        hunkAppliedCount++;
      }
    }

    if (hunkAppliedCount > 0) {
      return currentContent;
    }
  }

  // 2. Try line diff extraction (- old, + new)
  const patchLines = normalizedPatch.split("\n");
  const removedLines = [];
  const addedLines = [];

  for (const line of patchLines) {
    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("@@")) {
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("-")) {
      removedLines.push(line.startsWith("- ") ? line.slice(2) : line.slice(1));
    } else if (line.startsWith("+ ") || line.startsWith("+")) {
      addedLines.push(line.startsWith("+ ") ? line.slice(2) : line.slice(1));
    }
  }

  if (removedLines.length > 0) {
    const oldBlock = removedLines.join("\n");
    const newBlock = addedLines.join("\n");

    if (normalizedOriginal.includes(oldBlock)) {
      return normalizedOriginal.replace(oldBlock, newBlock);
    }

    // Try trimming individual lines match
    const origLines = normalizedOriginal.split("\n");
    let matchStart = -1;
    for (let i = 0; i <= origLines.length - removedLines.length; i++) {
      let allMatch = true;
      for (let j = 0; j < removedLines.length; j++) {
        if (origLines[i + j].trim() !== removedLines[j].trim()) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        matchStart = i;
        break;
      }
    }

    if (matchStart !== -1) {
      const beforePart = origLines.slice(0, matchStart);
      const afterPart = origLines.slice(matchStart + removedLines.length);
      return [...beforePart, ...addedLines, ...afterPart].join("\n");
    }
  }

  // 3. Fallback: If finding evidence is provided, replace evidence with added lines
  if (options.evidence && typeof options.evidence === "string") {
    const evidence = normalizeEol(options.evidence.trim());
    if (normalizedOriginal.includes(evidence) && addedLines.length > 0) {
      return normalizedOriginal.replace(evidence, addedLines.join("\n"));
    }
  }

  throw new Error("Failed to apply patch: target context lines not found in target file.");
}

/**
 * Generates a unified diff string between before and after contents of a file.
 *
 * @param {string} filePath
 * @param {string} beforeContent
 * @param {string} afterContent
 * @returns {string}
 */
export function generateUnifiedDiff(filePath, beforeContent, afterContent) {
  if (beforeContent === afterContent) return "";

  const normBefore = normalizeEol(beforeContent);
  const normAfter = normalizeEol(afterContent);

  const beforeLines = normBefore.split("\n");
  const afterLines = normAfter.split("\n");

  // Find common prefix
  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix++;
  }

  // Find common suffix
  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const contextBeforeStart = Math.max(0, prefix - 2);
  const contextAfterEndB = Math.min(beforeLines.length, beforeLines.length - suffix + 2);
  const contextAfterEndA = Math.min(afterLines.length, afterLines.length - suffix + 2);

  const removedChunk = beforeLines.slice(prefix, beforeLines.length - suffix);
  const addedChunk = afterLines.slice(prefix, afterLines.length - suffix);

  const lines = [];
  lines.push(`--- a/${filePath}`);
  lines.push(`+++ b/${filePath}`);
  lines.push(
    `@@ -${prefix + 1},${removedChunk.length} +${prefix + 1},${addedChunk.length} @@`,
  );

  for (const r of removedChunk) {
    lines.push(`-${r}`);
  }
  for (const a of addedChunk) {
    lines.push(`+${a}`);
  }

  return lines.join("\n");
}

/**
 * Applies a candidate patch to files inside an isolated workspace.
 *
 * @param {string} workspacePath
 * @param {Object} candidate
 * @param {Object} [finding]
 * @returns {Promise<{ changedFiles: string[], diff: string }>}
 */
export async function applyCandidatePatch(workspacePath, candidate, finding = null) {
  const proposedChanges = Array.isArray(candidate.proposedChanges) && candidate.proposedChanges.length > 0
    ? candidate.proposedChanges
    : [];

  const targetFiles = Array.isArray(candidate.files) && candidate.files.length > 0
    ? candidate.files
    : [finding?.file || finding?.affectedFile].filter(Boolean);

  const changedFiles = [];
  const diffs = [];

  if (proposedChanges.length > 0) {
    for (const change of proposedChanges) {
      const relFile = change.file;
      if (!relFile) continue;

      const fullPath = path.resolve(workspacePath, relFile);
      const relative = path.relative(workspacePath, fullPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`File path escape detected: ${relFile}`);
      }

      let originalContent = "";
      try {
        originalContent = await readFile(fullPath, "utf8");
      } catch {
        throw new Error(`Target file not found for patch: ${relFile}`);
      }

      const patchedContent = applyPatchToFileContent(originalContent, change.patch, {
        evidence: finding?.evidence,
      });

      await writeFile(fullPath, patchedContent, "utf8");
      changedFiles.push(relFile);

      const fileDiff = generateUnifiedDiff(relFile, originalContent, patchedContent);
      if (fileDiff) diffs.push(fileDiff);
    }
  } else if (candidate.patch && targetFiles.length > 0) {
    for (const relFile of targetFiles) {
      const fullPath = path.resolve(workspacePath, relFile);
      const relative = path.relative(workspacePath, fullPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`File path escape detected: ${relFile}`);
      }

      let originalContent = "";
      try {
        originalContent = await readFile(fullPath, "utf8");
      } catch {
        throw new Error(`Target file not found for patch: ${relFile}`);
      }

      const patchedContent = applyPatchToFileContent(originalContent, candidate.patch, {
        evidence: finding?.evidence,
      });

      await writeFile(fullPath, patchedContent, "utf8");
      changedFiles.push(relFile);

      const fileDiff = generateUnifiedDiff(relFile, originalContent, patchedContent);
      if (fileDiff) diffs.push(fileDiff);
    }
  } else {
    throw new Error("No proposed changes or patch found in candidate.");
  }

  return {
    changedFiles,
    diff: diffs.join("\n\n"),
  };
}
