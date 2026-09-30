import path from "node:path";
import { fileURLToPath } from "node:url";

const ANALYZER_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(ANALYZER_ROOT, "..");

// Resolved at call time, not at module evaluation: embedded deployments (the
// Next.js pages/api catch-all) set RELEASEGUARD_DEMO_PROJECT_ROOT in the
// importing module, and ESM evaluates static imports before any of that
// module's statements run. A module-level const would freeze the un-anchored
// path (inside the read-only serverless bundle) before the override is
// visible. Callers must use getDemoProjectRoot(), including as a default
// parameter value, so the env override is honored whenever it is set.
export function getDemoProjectRoot() {
  return process.env.RELEASEGUARD_DEMO_PROJECT_ROOT
    ? path.resolve(process.env.RELEASEGUARD_DEMO_PROJECT_ROOT)
    : path.resolve(BACKEND_ROOT, "../demo-project");
}

export function isDemoProjectRoot(candidate) {
  if (typeof candidate !== "string" || !candidate) return false;
  const resolvedCandidate = path.resolve(candidate);
  const demoRoot = getDemoProjectRoot();
  return process.platform === "win32"
    ? resolvedCandidate.toLowerCase() === demoRoot.toLowerCase()
    : resolvedCandidate === demoRoot;
}
