import path from "node:path";
import { fileURLToPath } from "node:url";

const ANALYZER_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(ANALYZER_ROOT, "..");
export const DEMO_PROJECT_ROOT = path.resolve(BACKEND_ROOT, "../demo-project");

export function isDemoProjectRoot(candidate) {
  if (typeof candidate !== "string" || !candidate) return false;
  const resolvedCandidate = path.resolve(candidate);
  return process.platform === "win32"
    ? resolvedCandidate.toLowerCase() === DEMO_PROJECT_ROOT.toLowerCase()
    : resolvedCandidate === DEMO_PROJECT_ROOT;
}
