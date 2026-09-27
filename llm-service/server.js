import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OllamaProvider } from "./providers/ollama.js";
import { buildReleaseAssessmentMessages } from "./prompts/releaseAssessment.js";
import { normalizeReleaseAssessment } from "./schemas/releaseAssessment.js";
import { buildRemediationPlanMessages } from "./prompts/remediationPlan.js";
import { normalizeRemediationPlan } from "./schemas/remediationPlan.js";

export function createLlmApp({
  provider = new OllamaProvider(),
  modelName = process.env.LLM_MODEL || "gpt-oss:20b",
  providerName = process.env.LLM_PROVIDER || "ollama",
} = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", async (req, res) => {
    const providerHealth = await provider.checkHealth().catch((err) => ({
      status: "error",
      error: err.message,
    }));

    res.json({
      status: "ok",
      provider: providerName,
      model: modelName,
      providerHealth,
    });
  });

  app.post("/v1/release-assessment", async (req, res) => {
    try {
      const { repository, stack, validation, findings, metrics } = req.body || {};

      const input = {
        repository: repository || "workspace",
        stack: Array.isArray(stack) ? stack : [],
        validation: validation || null,
        findings: Array.isArray(findings) ? findings : [],
        metrics: metrics || {},
      };

      const messages = buildReleaseAssessmentMessages(input);
      const rawResponse = await provider.chat({
        messages,
        format: "json",
      });

      const normalizedAssessment = normalizeReleaseAssessment(rawResponse);
      res.json(normalizedAssessment);
    } catch (error) {
      const statusCode = error.status || (error.code === "PROVIDER_UNAVAILABLE" ? 503 : 500);
      res.status(statusCode).json({
        error: {
          code: error.code || "ASSESSMENT_FAILED",
          message: error.message || "Failed to generate release assessment",
          details: error.details || null,
        },
      });
    }
  });

  app.post("/v1/remediation-plan", async (req, res) => {
    try {
      const { finding, repository, stack, fileContent } = req.body || {};
      if (!finding || typeof finding !== "object") {
        return res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            message: "A finding object is required to generate a remediation plan",
          },
        });
      }

      const input = {
        finding,
        repository: repository || "workspace",
        stack: Array.isArray(stack) ? stack : [],
        fileContent: typeof fileContent === "string" ? fileContent : "",
      };

      const messages = buildRemediationPlanMessages(input);
      const rawResponse = await provider.chat({
        messages,
        format: "json",
      });

      const normalizedPlan = normalizeRemediationPlan(rawResponse, finding.id);
      res.json(normalizedPlan);
    } catch (error) {
      const statusCode = error.status || (error.code === "PROVIDER_UNAVAILABLE" ? 503 : 500);
      res.status(statusCode).json({
        error: {
          code: error.code || "REMEDIATION_PLAN_FAILED",
          message: error.message || "Failed to generate remediation plan",
          details: error.details || null,
        },
      });
    }
  });

  // Catch-all 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Route '${req.method} ${req.path}' not found`,
      },
    });
  });

  return app;
}

export function startLlmServer({
  port = process.env.PORT || 8110,
  host = "127.0.0.1",
  provider,
} = {}) {
  const app = createLlmApp({ provider });
  const server = app.listen(port, host, () => {
    console.log(`ReleaseGuard LLM service listening on http://${host}:${server.address().port}`);
  });
  return server;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === currentFile) startLlmServer();
