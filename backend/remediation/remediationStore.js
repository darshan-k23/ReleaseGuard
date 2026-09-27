import { createRemediationCandidate, REMEDIATION_STATUS } from "./types.js";

export class RemediationStore {
  constructor() {
    this.remediations = new Map();
  }

  create(data) {
    const candidate = createRemediationCandidate(data);
    this.remediations.set(candidate.remediationId, candidate);
    return candidate;
  }

  get(remediationId) {
    return this.remediations.get(remediationId) || null;
  }

  listForJob(jobId) {
    return Array.from(this.remediations.values()).filter((item) => item.jobId === jobId);
  }

  update(remediationId, updates = {}) {
    const existing = this.remediations.get(remediationId);
    if (!existing) return null;
    if (updates.status && !Object.values(REMEDIATION_STATUS).includes(updates.status)) {
      throw new TypeError(`Invalid remediation status: ${updates.status}`);
    }
    const updated = {
      ...existing,
      ...updates,
      remediationId: existing.remediationId,
      jobId: existing.jobId,
      findingId: existing.findingId,
      createdAt: existing.createdAt,
    };
    this.remediations.set(remediationId, updated);
    return updated;
  }

  delete(remediationId) {
    return this.remediations.delete(remediationId);
  }

  clear() {
    this.remediations.clear();
  }
}

export const defaultRemediationStore = new RemediationStore();
