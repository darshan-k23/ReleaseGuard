export const remediationPlanJsonSchema = {
  type: "object",
  properties: {
    findingId: {
      type: "string",
      description: "The identifier of the finding being remediated.",
    },
    diagnosis: {
      type: "string",
      description: "Technical root-cause diagnosis explaining why this finding occurred in the file.",
    },
    plan: {
      type: "array",
      items: { type: "string" },
      description: "Ordered, minimal remediation plan steps.",
    },
    filesToChange: {
      type: "array",
      items: { type: "string" },
      description: "Exact list of relative file paths to be changed.",
    },
    proposedChanges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          description: { type: "string" },
          patch: { type: "string" },
        },
        required: ["file", "description", "patch"],
      },
      description: "Proposed code patch candidates for each affected file.",
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
      description: "Steps to verify that the fix resolves the finding without breaking existing behavior.",
    },
  },
  required: [
    "findingId",
    "diagnosis",
    "plan",
    "filesToChange",
    "proposedChanges",
    "validationPlan",
  ],
};

export function normalizeRemediationPlan(raw, defaultFindingId = "") {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("Remediation plan response must be a JSON object");
  }

  const findingId = String(raw.findingId || defaultFindingId || "unknown");
  const diagnosis = typeof raw.diagnosis === "string" && raw.diagnosis.trim()
    ? raw.diagnosis.trim()
    : "Diagnosis not provided.";

  const plan = Array.isArray(raw.plan)
    ? raw.plan.map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
    : typeof raw.plan === "string"
      ? [raw.plan]
      : ["Review finding and apply minimal source changes."];

  const filesToChange = Array.isArray(raw.filesToChange)
    ? raw.filesToChange.map((item) => String(item))
    : [];

  const proposedChanges = Array.isArray(raw.proposedChanges)
    ? raw.proposedChanges.map((change) => {
        if (typeof change === "string") {
          return { file: filesToChange[0] || "unknown", description: "Proposed patch", patch: change };
        }
        return {
          file: String(change.file || filesToChange[0] || "unknown"),
          description: String(change.description || "Proposed fix"),
          patch: String(change.patch || change.diff || ""),
        };
      })
    : [];

  const validationPlan = Array.isArray(raw.validationPlan)
    ? raw.validationPlan.map((item) => {
        if (typeof item === "string") return { step: item, expectedOutcome: "Verification passed" };
        return {
          step: String(item.step || "Verify fix"),
          command: item.command ? String(item.command) : undefined,
          expectedOutcome: item.expectedOutcome ? String(item.expectedOutcome) : "Verification passed",
        };
      })
    : [{ step: "Run verification tests", expectedOutcome: "Pass" }];

  return {
    findingId,
    diagnosis,
    plan,
    filesToChange: filesToChange.length > 0 ? filesToChange : proposedChanges.map((c) => c.file),
    proposedChanges,
    validationPlan,
  };
}
