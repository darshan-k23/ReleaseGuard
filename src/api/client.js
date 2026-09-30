// Same-origin relative "/api" works in every environment: Next.js API routes
// in production, and the dev proxy locally. Set NEXT_PUBLIC_API_BASE to an
// absolute URL only when the API is hosted on a different origin.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, options);
  } catch (error) {
    // Network-level failures (server down, DNS, CORS, mixed content) surface
    // here as "Failed to fetch". Give users an actionable message instead.
    if (error instanceof TypeError) {
      const exception = new Error(
        `Cannot reach the ReleaseGuard API at ${API_BASE}${path}. If the API runs on a separate origin, set NEXT_PUBLIC_API_BASE to its URL and enable CORS.`,
      );
      exception.code = "API_UNREACHABLE";
      throw exception;
    }
    throw error;
  }
  const body = await res.json();
  if (!res.ok) {
    const error = body.error;
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
