import { startServer } from "../backend/server.js";
import { startLlmServer } from "../llm-service/server.js";
import { OllamaProvider } from "../llm-service/providers/ollama.js";
import { generateDemoRepositories } from "../demo-generator/generate.js";

async function main() {
  console.log("================================================================================");
  console.log("ReleaseGuard End-to-End Live Verification Phase");
  console.log("================================================================================\n");

  // 1. Ensure demo repositories are generated
  await generateDemoRepositories();

  // 2. Start LLM Service on 8110 with Ollama qwen3:14b (or fallback)
  const ollamaProvider = new OllamaProvider({
    baseUrl: "http://127.0.0.1:11434",
    model: "qwen3:14b",
    timeoutMs: 30_000,
  });

  const llmServer = startLlmServer({
    port: 8110,
    host: "127.0.0.1",
    provider: ollamaProvider,
  });
  console.log("LLM service started on port 8110");

  // 3. Start Backend on 8090
  const backendServer = startServer({
    port: 8090,
    host: "127.0.0.1",
  });
  console.log("ReleaseGuard backend started on port 8090\n");

  const reposToTest = [
    "release-ready",
    "warning-only",
    "configuration-risk",
    "security-blocked",
    "test-failing",
    "critically-blocked",
  ];

  const results = [];

  for (const repoName of reposToTest) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`Testing Repository: ${repoName}`);
    console.log(`--------------------------------------------------------------------------------`);

    const logEntry = {
      repoName,
      jobId: null,
      stack: [],
      buildResult: "NOT_RUN",
      testResult: "NOT_RUN",
      findings: [],
      score: null,
      releaseDecision: null,
      llmAvailability: null,
      llmAssessmentStatus: null,
      llmSummary: null,
      remediationPlanStatus: null,
      remediationApplyStatus: null,
      scoreBefore: null,
      scoreAfter: null,
      resolvedFindings: [],
      diff: "",
    };

    try {
      // Step 1: Create Job
      const createRes = await fetch("http://127.0.0.1:8090/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoName: repoName }),
      });
      const createData = await createRes.json();
      logEntry.jobId = createData.jobId;
      console.log(`Job Created: ${logEntry.jobId} (Status: ${createData.status})`);

      // Step 2: Poll status
      let job = createData;
      while (job.status === "CREATED" || job.status === "CLONING") {
        await new Promise((r) => setTimeout(r, 400));
        const jRes = await fetch(`http://127.0.0.1:8090/api/jobs/${logEntry.jobId}`);
        job = await jRes.json();
      }
      console.log(`Job Status: ${job.status}`);

      // Step 3: Stack Detection
      const stackRes = await fetch(`http://127.0.0.1:8090/api/jobs/${logEntry.jobId}/stack`);
      const stackData = await stackRes.json();
      logEntry.stack = stackData.ecosystems || [];
      console.log(`Detected Stack:`, logEntry.stack.map((s) => `${s.ecosystem} (${s.manifest})`).join(", ") || "None");

      // Step 4: Validation (Build/Test)
      const valRes = await fetch(`http://127.0.0.1:8090/api/jobs/${logEntry.jobId}/validate`, { method: "POST" });
      const valData = await valRes.json();
      const executions = valData.validation?.executions || [];
      const buildExec = executions.find((e) => e.command.includes("build") || e.command.includes("package"));
      const testExec = executions.find((e) => e.command.includes("test"));
      logEntry.buildResult = buildExec ? buildExec.status : (valData.validation?.passed ? "PASS" : valData.validation?.status || "NOT_RUN");
      logEntry.testResult = testExec ? testExec.status : (valData.validation?.passed ? "PASS" : valData.validation?.status || "NOT_RUN");
      console.log(`Validation Overall: ${valData.validation?.status || "NOT_RUN"} (Build: ${logEntry.buildResult}, Tests: ${logEntry.testResult})`);

      // Step 5: Deterministic Analysis & LLM Assessment
      const anaRes = await fetch(`http://127.0.0.1:8090/api/jobs/${logEntry.jobId}/analyze`, { method: "POST" });
      const anaData = await anaRes.json();
      logEntry.findings = (anaData.findings || []).map((f) => ({
        id: f.id,
        ruleId: f.ruleId,
        category: f.category,
        severity: f.severity,
        title: f.title,
        file: f.affectedFile || f.file,
      }));
      logEntry.score = anaData.score;
      logEntry.releaseDecision = anaData.releaseDecision || anaData.status;
      logEntry.llmAssessmentStatus = anaData.llmAssessment?.status || "UNKNOWN";
      logEntry.llmAvailability = anaData.llmAssessment?.status === "AVAILABLE";
      logEntry.llmSummary = anaData.llmAssessment?.summary || null;

      console.log(`Deterministic Score: ${logEntry.score} / 100 | Release Decision: ${logEntry.releaseDecision}`);
      console.log(`Findings (${logEntry.findings.length}):`, logEntry.findings.map((f) => `[${f.severity}] ${f.ruleId}`).join(", ") || "None");
      console.log(`LLM Assessment Status: ${logEntry.llmAssessmentStatus}`);
      if (logEntry.llmSummary) console.log(`LLM Summary: "${logEntry.llmSummary}"`);

      // Step 6: Remediation (if findings exist)
      if (logEntry.findings.length > 0) {
        const targetFinding = logEntry.findings[0];
        console.log(`Testing Remediation for Finding: ${targetFinding.ruleId} (${targetFinding.id})`);

        const planRes = await fetch(`http://127.0.0.1:8090/api/jobs/${logEntry.jobId}/remediation-plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ findingId: targetFinding.id }),
        });

        if (planRes.ok) {
          const candidate = await planRes.json();
          logEntry.remediationPlanStatus = "PROPOSED";
          console.log(`Remediation Candidate Generated: ${candidate.remediationId} (Status: ${candidate.status})`);

          // Step 7: Apply remediation in isolated before/after workspace
          const applyRes = await fetch(`http://127.0.0.1:8090/api/jobs/${logEntry.jobId}/remediation/${candidate.remediationId}/apply`, {
            method: "POST",
          });
          const applyData = await applyRes.json();
          logEntry.remediationApplyStatus = applyData.status || (applyRes.ok ? "VALIDATED" : "FAILED");
          logEntry.scoreBefore = applyData.scoreBefore;
          logEntry.scoreAfter = applyData.scoreAfter;
          logEntry.resolvedFindings = applyData.resolvedFindings || [];
          logEntry.diff = applyData.diff || "";

          console.log(`Remediation Applied in Sandbox. Status: ${logEntry.remediationApplyStatus} | Score Delta: ${logEntry.scoreBefore} -> ${logEntry.scoreAfter} | Resolved Findings: ${logEntry.resolvedFindings.length}`);
        } else {
          const errData = await planRes.json();
          logEntry.remediationPlanStatus = `ERROR: ${errData.error?.message}`;
          console.log(`Remediation Plan Error:`, errData);
        }
      } else {
        logEntry.remediationPlanStatus = "N/A (Zero findings to remediate)";
        logEntry.remediationApplyStatus = "N/A";
        console.log("No findings to remediate (Clean repository).");
      }

      results.push(logEntry);
    } catch (err) {
      console.error(`Error during testing ${repoName}:`, err);
      logEntry.error = err.message;
      results.push(logEntry);
    }
  }

  // Close servers
  llmServer.close();
  backendServer.close();

  console.log("\n================================================================================");
  console.log("Live Execution Summary Table:");
  console.log("================================================================================");
  console.log(JSON.stringify(results, null, 2));

  return results;
}

main().catch((err) => {
  console.error("Verification script failed:", err);
  process.exit(1);
});
