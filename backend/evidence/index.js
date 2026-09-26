/**
 * ReleaseGuard Evidence module
 * Foundation for gathering, normalizing, and verifying evidence across repository checks.
 */
export {
  createFindingFingerprint,
  createRelatedEvidence,
  findLine,
  createFinding,
} from "../analyzer/utils/evidence.js";
