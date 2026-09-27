export const releaseAssessmentJsonSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Concise summary of the repository release readiness based strictly on evidence.",
    },
    rootCauses: {
      type: "array",
      items: { type: "string" },
      description: "List of identified root causes directly linked to findings and validation evidence.",
    },
    riskAssessment: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"],
        },
        rationale: { type: "string" },
      },
      required: ["level", "rationale"],
      description: "Risk evaluation based on severity of open blockers and failed validation checks.",
    },
    recommendedFixes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          ruleId: { type: "string" },
          targetFile: { type: "string" },
          fix: { type: "string" },
        },
        required: ["title", "fix"],
      },
      description: "Narrowly scoped recommendations to address identified findings.",
    },
    validationPlan: {
      type: "array",
      items: {
        type: "object",
        properties: {
          step: { type: "string" },
          command: { type: "string" },
          expectedOutcome: { type: "string" },
        },
        required: ["step"],
      },
      description: "Step-by-step verification plan using only available validation candidates.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Confidence score between 0.0 and 1.0 reflecting completeness of evidence.",
    },
    limitations: {
      type: "array",
      items: { type: "string" },
      description: "Explicit constraints and unverified areas (e.g. unrun checks, unqueried live databases).",
    },
  },
  required: [
    "summary",
    "rootCauses",
    "riskAssessment",
    "recommendedFixes",
    "validationPlan",
    "confidence",
    "limitations",
  ],
};

export function normalizeReleaseAssessment(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("Assessment response must be a JSON object");
  }

  const summary = typeof raw.summary === "string" && raw.summary.trim()
    ? raw.summary.trim()
    : "No assessment summary provided.";

  const rootCauses = Array.isArray(raw.rootCauses)
    ? raw.rootCauses.map((item) => typeof item === "string" ? item : JSON.stringify(item))
    : [];

  let riskAssessment = raw.riskAssessment;
  if (typeof riskAssessment === "string") {
    riskAssessment = { level: "MEDIUM", rationale: riskAssessment };
  } else if (!riskAssessment || typeof riskAssessment !== "object") {
    riskAssessment = { level: "MEDIUM", rationale: "Risk assessment not structured." };
  } else {
    riskAssessment = {
      level: String(riskAssessment.level || "MEDIUM").toUpperCase(),
      rationale: String(riskAssessment.rationale || "No rationale provided."),
    };
  }

  const recommendedFixes = Array.isArray(raw.recommendedFixes)
    ? raw.recommendedFixes.map((item) => {
        if (typeof item === "string") return { title: item, fix: item };
        return {
          title: String(item.title || "Fix recommendation"),
          ruleId: item.ruleId ? String(item.ruleId) : undefined,
          targetFile: item.targetFile || item.file ? String(item.targetFile || item.file) : undefined,
          fix: String(item.fix || item.description || "Review and apply fix."),
        };
      })
    : [];

  const validationPlan = Array.isArray(raw.validationPlan)
    ? raw.validationPlan.map((item) => {
        if (typeof item === "string") return { step: item, expectedOutcome: "Verification pass" };
        return {
          step: String(item.step || "Verification step"),
          command: item.command ? String(item.command) : undefined,
          expectedOutcome: item.expectedOutcome ? String(item.expectedOutcome) : "Expected pass",
        };
      })
    : [];

  const confidence = typeof raw.confidence === "number" && !Number.isNaN(raw.confidence)
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0.85;

  const limitations = Array.isArray(raw.limitations)
    ? raw.limitations.map((item) => typeof item === "string" ? item : JSON.stringify(item))
    : ["Assessment is based solely on static analysis and local validation evidence."];

  return {
    summary,
    rootCauses,
    riskAssessment,
    recommendedFixes,
    validationPlan,
    confidence,
    limitations,
  };
}
