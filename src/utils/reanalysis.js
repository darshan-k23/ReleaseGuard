export async function executeReanalysis({
  currentJob = null,
  analysis = null,
  validateJobFn = null,
  analyzeJobFn = null,
  runAnalysisFn = null,
} = {}) {
  const jobId = currentJob?.jobId || analysis?.job?.jobId;

  if (jobId && typeof analyzeJobFn === "function") {
    let validation = null;
    if (typeof validateJobFn === "function") {
      try {
        const valData = await validateJobFn(jobId);
        validation = valData?.validation || null;
      } catch {
        validation = null;
      }
    }

    const result = await analyzeJobFn(jobId);
    const projectName =
      result?.repository?.name ||
      currentJob?.repositoryName ||
      analysis?.repository?.name ||
      result?.project?.name ||
      "Repository";
    const projectDescription =
      result?.repository?.description ||
      result?.project?.description ||
      "Analyzed repository";

    return {
      result,
      project: { name: projectName, description: projectDescription },
      validation,
      isJobScoped: true,
      jobId,
    };
  }

  if (typeof runAnalysisFn === "function") {
    const result = await runAnalysisFn();
    return {
      result,
      project: result?.project || { name: "Repository", description: "Analyzed repository" },
      validation: null,
      isJobScoped: false,
      jobId: null,
    };
  }

  throw new Error("No re-analysis execution strategy available.");
}
