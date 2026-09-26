const API_BASE = "http://localhost:8090/api";

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
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
    if (error.message === "No repository analysis has been run yet") return null;
    throw error;
  }
}

export const runAnalysis = () => request("/analyze", { method: "POST" });
