// Dev uses the local Express API (scripts/dev.mjs starts it on 8090).
// Production builds default to the deployed analyzer API; override with
// VITE_API_BASE at build time if the backend moves.
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.DEV
    ? "http://localhost:8090/api"
    : "https://releaseguardbackend.freebuff.app/api");

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const raw = await res.text();

  // Parse defensively: proxies and static hosts can answer with HTML/plain-text
  // error pages (e.g. a 404 from a stale deployment), and parsing those as JSON
  // used to surface as "Unexpected token 'T' ..." instead of a real message.
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    const exception = new Error(
      res.ok
        ? `The API returned a non-JSON response for ${path}.`
        : `Request to ${path} failed with ${res.status} (non-JSON response). If the site was just redeployed, refresh the page.`,
    );
    exception.code = "BAD_RESPONSE";
    exception.details = raw.slice(0, 160);
    throw exception;
  }

  if (!res.ok) {
    const error = body?.error;
    const exception = new Error(
      (typeof error === "string" ? error : error?.message) ||
        `Request to ${path} failed with ${res.status}`,
    );
    exception.code = typeof error === "object" ? error.code : undefined;
    exception.details = typeof error === "object" ? error.details : undefined;
    throw exception;
  }
  return body;
}

export const getProject = () => request("/project");

export async function getLatestAnalysis() {
  try {
    return await request("/analysis/latest");
  } catch (error) {
    if (error.message === "No repository analysis has been run yet" || error.code === "ANALYSIS_NOT_FOUND") return null;
    throw error;
  }
}

export const runAnalysis = () => request("/analyze", { method: "POST" });

export const getDemoRepositories = () => request("/demo-repositories");

export const createJob = ({ repositoryUrl, demoName, branch }) =>
  request("/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repositoryUrl, demoName, branch }),
  });

export const getJob = (jobId) => request(`/jobs/${jobId}`);

export const getJobStack = (jobId) => request(`/jobs/${jobId}/stack`);

export const validateJob = (jobId) => request(`/jobs/${jobId}/validate`, { method: "POST" });

export const analyzeJob = (jobId) => request(`/jobs/${jobId}/analyze`, { method: "POST" });

export const assessJob = (jobId) => request(`/jobs/${jobId}/assess`, { method: "POST" });

export const createRemediationPlan = (jobId, findingId) =>
  request(`/jobs/${jobId}/remediation-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ findingId }),
  });

export const getRemediations = (jobId) => request(`/jobs/${jobId}/remediation`);

export const applyRemediation = (jobId, remediationId) =>
  request(`/jobs/${jobId}/remediation/${remediationId}/apply`, { method: "POST" });
