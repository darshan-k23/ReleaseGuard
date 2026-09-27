export async function requestReleaseAssessment({
  repository,
  stack = [],
  validation = null,
  findings = [],
  metrics = {},
  llmServiceUrl = process.env.LLM_SERVICE_URL || "http://127.0.0.1:8110",
  fetchFn = globalThis.fetch,
} = {}) {
  const url = `${llmServiceUrl.replace(/\/+$/, "")}/v1/release-assessment`;

  let response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repository,
        stack,
        validation,
        findings,
        metrics,
      }),
    });
  } catch (err) {
    const error = new Error(`Failed to communicate with ReleaseGuard LLM service at ${llmServiceUrl}: ${err.message}`);
    error.code = "LLM_SERVICE_UNAVAILABLE";
    error.status = 503;
    error.details = err.message;
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(
      errorBody?.error?.message || `LLM service returned HTTP ${response.status}`,
    );
    error.code = errorBody?.error?.code || "LLM_SERVICE_ERROR";
    error.status = response.status >= 500 ? 502 : response.status;
    error.details = errorBody?.error?.details || null;
    throw error;
  }

  return response.json();
}

export async function getSafeReleaseAssessment(params, fetchAssessmentFn = requestReleaseAssessment) {
  try {
    const raw = await fetchAssessmentFn(params);
    return {
      status: "AVAILABLE",
      summary: raw.summary || "Release assessment generated.",
      rootCauses: Array.isArray(raw.rootCauses) ? raw.rootCauses : [],
      riskAssessment: raw.riskAssessment || { level: "MEDIUM", rationale: "Assessment completed." },
      recommendedFixes: Array.isArray(raw.recommendedFixes) ? raw.recommendedFixes : [],
      validationPlan: Array.isArray(raw.validationPlan) ? raw.validationPlan : [],
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0.85,
      limitations: Array.isArray(raw.limitations) ? raw.limitations : [],
      error: null,
    };
  } catch (error) {
    return {
      status: "UNAVAILABLE",
      summary: "LLM release assessment is currently unavailable.",
      rootCauses: [],
      riskAssessment: {
        level: "UNKNOWN",
        rationale: "LLM service was unreachable or returned an error; deterministic release decision remains authoritative.",
      },
      recommendedFixes: [],
      validationPlan: [],
      confidence: 0,
      limitations: ["Automated LLM assessment could not be retrieved."],
      error: error.message || "LLM service unavailable",
    };
  }
}

export async function requestRemediationPlan({
  finding,
  repository = "workspace",
  stack = [],
  fileContent = "",
  llmServiceUrl = process.env.LLM_SERVICE_URL || "http://127.0.0.1:8110",
  fetchFn = globalThis.fetch,
} = {}) {
  const url = `${llmServiceUrl.replace(/\/+$/, "")}/v1/remediation-plan`;

  let response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        finding,
        repository,
        stack,
        fileContent,
      }),
    });
  } catch (err) {
    const error = new Error(`Failed to communicate with ReleaseGuard LLM service at ${llmServiceUrl}: ${err.message}`);
    error.code = "LLM_SERVICE_UNAVAILABLE";
    error.status = 503;
    error.details = err.message;
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(
      errorBody?.error?.message || `LLM service returned HTTP ${response.status}`,
    );
    error.code = errorBody?.error?.code || "LLM_SERVICE_ERROR";
    error.status = response.status >= 500 ? 502 : response.status;
    error.details = errorBody?.error?.details || null;
    throw error;
  }

  return response.json();
}
