import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm, access } from "node:fs/promises";
import { ApiError } from "../apiErrors.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Resolved at call time, not at module evaluation: embedded deployments (the
// Next.js pages/api catch-all) set RELEASEGUARD_WORKSPACES_ROOT in the
// importing module, and ESM evaluates static imports before any of that
// module's statements run. A module-level const would freeze the un-anchored
// path (inside the read-only serverless bundle) before the override is
// visible, making workspace mkdir fail with a read-only filesystem error.
export function getWorkspacesRoot() {
  return process.env.RELEASEGUARD_WORKSPACES_ROOT
    ? path.resolve(process.env.RELEASEGUARD_WORKSPACES_ROOT)
    : path.resolve(currentDir, "..", "workspaces");
}

export function resolveWorkspacePath(jobId, root = getWorkspacesRoot()) {
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

export async function createWorkspace(jobId, root = getWorkspacesRoot()) {
  const workspacePath = resolveWorkspacePath(jobId, root);
  await mkdir(workspacePath, { recursive: true });
  return workspacePath;
}

export async function removeWorkspace(jobId, root = getWorkspacesRoot()) {
  const workspacePath = resolveWorkspacePath(jobId, root);
  await rm(workspacePath, { recursive: true, force: true });
}

export async function workspaceExists(jobId, root = getWorkspacesRoot()) {
  try {
    const workspacePath = resolveWorkspacePath(jobId, root);
    await access(workspacePath);
    return true;
  } catch {
    return false;
  }
}
