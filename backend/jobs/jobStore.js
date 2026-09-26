import { createRepositoryJob } from "./types.js";

export class JobStore {
  constructor() {
    this.jobs = new Map();
  }

  create(jobData) {
    const job = createRepositoryJob(jobData);
    this.jobs.set(job.jobId, job);
    return job;
  }

  get(jobId) {
    return this.jobs.get(jobId) || null;
  }

  update(jobId, updates = {}) {
    const existing = this.jobs.get(jobId);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...updates,
      jobId: existing.jobId,
      createdAt: existing.createdAt,
    };
    this.jobs.set(jobId, updated);
    return updated;
  }

  list() {
    return Array.from(this.jobs.values());
  }

  delete(jobId) {
    return this.jobs.delete(jobId);
  }

  clear() {
    this.jobs.clear();
  }
}

export const defaultJobStore = new JobStore();
