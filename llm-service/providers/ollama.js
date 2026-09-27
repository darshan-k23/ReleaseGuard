export class OllamaProvider {
  constructor({
    baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    model = process.env.LLM_MODEL || "qwen3:14b",
    fetchFn = globalThis.fetch,
    timeoutMs = 30_000,
  } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/+$/, "");
    this.model = String(model);
    this.fetch = fetchFn;
    this.timeoutMs = timeoutMs;
  }

  async checkHealth() {
    try {
      const response = await this.fetch(`${this.baseUrl}/api/version`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        return { status: "ok", version: data?.version || "unknown" };
      }
      return { status: "degraded", httpStatus: response.status };
    } catch (err) {
      return { status: "unavailable", error: err.message };
    }
  }

  async chat({ messages, format = "json", options = {} } = {}) {
    const url = `${this.baseUrl}/api/chat`;
    const payload = {
      model: this.model,
      messages,
      format,
      stream: false,
      options: {
        temperature: 0.1,
        ...options,
      },
    };

    let response;
    try {
      response = await this.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (networkError) {
      const isTimeout = networkError.name === "TimeoutError" || networkError.code === "ABORT_ERR";
      const error = new Error(
        isTimeout
          ? `Ollama request timed out after ${this.timeoutMs}ms`
          : `Failed to connect to Ollama service at ${this.baseUrl}: ${networkError.message}`,
      );
      error.code = "PROVIDER_UNAVAILABLE";
      error.status = 503;
      error.details = networkError.message;
      throw error;
    }

    if (!response.ok && response.status === 404) {
      // Try to discover installed models if configured model is not found
      try {
        const tagsRes = await this.fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (tagsRes.ok) {
          const tagsData = await tagsRes.json();
          const availableModel = tagsData?.models?.[0]?.name;
          if (availableModel && availableModel !== this.model) {
            this.model = availableModel;
            payload.model = availableModel;
            response = await this.fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(this.timeoutMs),
            });
          }
        }
      } catch {
        // Continue to error reporting below
      }
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const error = new Error(`Ollama API returned HTTP ${response.status}: ${errorText || response.statusText}`);
      error.code = response.status === 404 ? "MODEL_NOT_FOUND" : "PROVIDER_ERROR";
      error.status = response.status >= 500 ? 502 : response.status;
      error.details = errorText;
      throw error;
    }

    const data = await response.json();
    const content = data?.message?.content;
    if (!content || typeof content !== "string") {
      const error = new Error("Ollama returned empty or missing message content");
      error.code = "INVALID_PROVIDER_RESPONSE";
      error.status = 502;
      throw error;
    }

    let cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleanContent);
    } catch (jsonErr) {
      const match = cleanContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || cleanContent.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[1] || match[0]);
        } catch {
          // parse failed
        }
      }
      if (!parsed) {
        const error = new Error("Failed to parse JSON response from Ollama model output");
        error.code = "MALFORMED_MODEL_OUTPUT";
        error.status = 502;
        error.details = cleanContent.slice(0, 1000);
        throw error;
      }
    }

    return parsed;
  }
}
