import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mkdir, rm, access } from "node:fs/promises";
import { ApiError } from "../apiErrors.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const WORKSPACES_ROOT = path.join(
  os.tmpdir(),
  "releaseguard-workspaces",
);

export function resolveWorkspacePath(jobId, root = WORKSPACES_ROOT) {
  if (typeof jobId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    throw new ApiError(400, "INVALID_JOB_ID", "Job ID contains invalid characters or path traversal.");
  }

  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, jobId);
  const relative = path.relative(resolvedRoot, resolvedPath);

  if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
    throw new ApiError(400, "INVALID_WORKSPACE_PATH", "Workspace path escape detected.");
  }

  return resolvedPath;
}

export async function createWorkspace(jobId, root = WORKSPACES_ROOT) {
  const workspacePath = resolveWorkspacePath(jobId, root);
  await mkdir(workspacePath, { recursive: true });
  return workspacePath;
}

export async function removeWorkspace(jobId, root = WORKSPACES_ROOT) {
  const workspacePath = resolveWorkspacePath(jobId, root);
  await rm(workspacePath, { recursive: true, force: true });
}

export async function workspaceExists(jobId, root = WORKSPACES_ROOT) {
  try {
    const workspacePath = resolveWorkspacePath(jobId, root);
    await access(workspacePath);
    return true;
  } catch {
    return false;
  }
}
