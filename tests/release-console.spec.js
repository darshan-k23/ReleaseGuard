import { test, expect } from "@playwright/test";

const findingsList = (page) => page.locator('[aria-label="Filtered release findings"] li');

 test.beforeAll(async () => {
  const response = await fetch("http://localhost:8090/api/analyze", { method: "POST" });
  if (!response.ok) throw new Error(`Baseline analysis returned ${response.status}`);
  const analysis = await response.json();
  if (analysis.findings.length !== 7) {
    throw new Error(`Expected seven baseline findings; received ${analysis.findings.length}`);
  }
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Findings", exact: true })).toBeVisible();
});

test("filters findings by severity, category, status, and source text", async ({ page }) => {
  const analysisResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST",
    { timeout: 45_000 },
  );
  await page.getByRole("button", { name: "Analyze repository now" }).click();
  expect((await analysisResponse).ok()).toBeTruthy();
  await expect(page.getByText(/Analysis completed · 7 findings/)).toBeVisible({ timeout: 10_000 });
  await expect(findingsList(page)).toHaveCount(7);

  await page.getByLabel("Filter by severity").selectOption("HIGH");
  await expect(findingsList(page)).toHaveCount(2);

  await page.getByLabel("Filter by category").selectOption("Integration");
  await expect(findingsList(page)).toHaveCount(1);

  await page.getByLabel("Filter by status").selectOption("OPEN");
  await expect(findingsList(page)).toHaveCount(1);

  await page.getByRole("searchbox", { name: "Search findings" }).fill("localhost:9090");
  await expect(findingsList(page)).toHaveCount(1);
  await expect(findingsList(page).first()).toContainText("INT-API-PORT-MISMATCH");

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(findingsList(page)).toHaveCount(7);
});

test("opens evidence detail, shows line context, and closes with Escape", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search findings" });
  await search.fill("synthetic credential");
  const findingButton = page.locator('[aria-label="Filtered release findings"]').getByRole("button", { name: /Synthetic credential sentinel is present/ });
  await findingButton.click();

  const dialog = page.getByRole("dialog", { name: "Synthetic credential sentinel is present" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("SEC-HARDCODED-CREDENTIAL")).toBeVisible();
  await expect(dialog.getByText("100%", { exact: true })).toBeVisible();
  await expect(dialog.getByText("backend/src/main/resources/application.properties", { exact: true })).toBeVisible();
  await expect(dialog.getByText("shopsphere.demo.password=demo-only-not-a-secret", { exact: true })).toBeVisible();
  await expect(dialog.getByText("L6", { exact: true })).toBeVisible();
  await expect(dialog.getByText("IBM Bob remediation hint")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(findingButton).toBeFocused();
});

test("fits a mobile viewport and keeps the evidence dialog within the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Findings", exact: true })).toBeVisible();
  await expect(findingsList(page)).toHaveCount(7);
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(pageWidth).toBeLessThanOrEqual(390);

  await page.getByRole("searchbox", { name: "Search findings" }).fill("synthetic credential");
  await page.locator('[aria-label="Filtered release findings"]').getByRole("button", { name: /Synthetic credential sentinel is present/ }).click();
  const dialog = page.getByRole("dialog", { name: "Synthetic credential sentinel is present" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("shopsphere.demo.password=demo-only-not-a-secret", { exact: true })).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
});

test("copies analysis and selected-finding remediation prompts", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const selectedFinding = page.getByLabel("Selected finding for IBM Bob");
  await selectedFinding.selectOption({ label: "LOW · SEC-HARDCODED-CREDENTIAL" });

  await page.getByRole("button", { name: "Copy IBM Bob Analysis Prompt" }).click();
  await expect(page.getByText("Copied to clipboard").first()).toBeVisible();
  const analysisPrompt = await page.evaluate(() => navigator.clipboard.readText());
  const normalizedAnalysisPrompt = analysisPrompt.toLowerCase();
  expect(normalizedAnalysisPrompt).toContain("inspect the repository");
  expect(normalizedAnalysisPrompt).toContain("verify whether the finding below is real");
  expect(normalizedAnalysisPrompt).toContain("backend/src/main/resources/application.properties:6-6");
  expect(normalizedAnalysisPrompt).toContain("releaseguard does not invoke ibm bob");

  await page.getByRole("button", { name: "Copy Bob Fix Prompt" }).click();
  await expect(page.getByText("Copied to clipboard").nth(1)).toBeVisible();
  const fixPrompt = await page.evaluate(() => navigator.clipboard.readText());
  const normalizedFixPrompt = fixPrompt.toLowerCase();
  expect(normalizedFixPrompt).toContain("fix only this issue");
  expect(normalizedFixPrompt).toContain("do not perform unrelated cleanup");
  expect(normalizedFixPrompt).toContain("preserve every other intentional baseline issue");
  expect(fixPrompt).toMatch(/BEFORE\s+CHANGE\s+VALIDATION\s+AFTER/);
});

test("imports and displays valid Bob evidence locally", async ({ page }) => {
  const evidence = {
    sessionId: "bob-session-demo-001",
    prompt: "Inspect SEC-HARDCODED-CREDENTIAL at application.properties:6",
    summary: "Verified the marker is synthetic and removed it.",
    findings: [{ ruleId: "SEC-HARDCODED-CREDENTIAL", title: "Synthetic marker removed" }],
    filesChanged: ["backend/src/main/resources/application.properties"],
    validation: [{ command: "mvn -q test", result: "2/3 passed; intentional baseline test unchanged" }],
    before: { status: "RELEASE BLOCKED", score: 48, openFindings: 7 },
    after: { status: "RELEASE BLOCKED", score: 50, openFindings: 6 },
  };
  await page.getByLabel("Import Bob evidence JSON").setInputFiles({
    name: "bob-session.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(evidence)),
  });

  const imported = page.getByLabel("Imported Bob session evidence");
  await expect(imported).toContainText("bob-session-demo-001");
  await expect(imported).toContainText("Verified the marker is synthetic and removed it.");
  await expect(imported).toContainText("backend/src/main/resources/application.properties");
  await expect(imported).toContainText("mvn -q test");
  await expect(imported).toContainText("2/3 passed");
  await expect(imported).toContainText("48");
  await expect(imported).toContainText("50");
  await expect(page.getByText("Imported locally")).toBeVisible();
  await expect(page.getByText(/Imported session bob-session-demo-001/)).toBeVisible();
});

test("rejects invalid JSON and schema without uploading it", async ({ page }) => {
  await page.getByLabel("Import Bob evidence JSON").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{ invalid json"),
  });
  await expect(page.getByRole("alert")).toContainText("invalid JSON");
  await expect(page.getByLabel("Imported Bob session evidence")).toHaveCount(0);

  await page.getByLabel("Import Bob evidence JSON").setInputFiles({
    name: "incomplete.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ sessionId: "only-an-id" })),
  });
  await expect(page.getByRole("alert")).toContainText("prompt must be a non-empty string");
  await expect(page.getByLabel("Imported Bob session evidence")).toHaveCount(0);
});

test("re-runs ReleaseGuard and shows resolved, remaining, score, and status comparison", async ({ page }) => {
  const analysisResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST",
    { timeout: 45_000 },
  );
  await page.getByRole("button", { name: "Re-run ReleaseGuard" }).click();
  expect((await analysisResponse).ok()).toBeTruthy();

  const comparison = page.locator('[aria-labelledby="comparison-heading"]');
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText("Resolved findings");
  await expect(comparison).toContainText("Remaining findings");
  await expect(comparison).toContainText("Score delta");
  await expect(comparison).toContainText("RELEASE BLOCKED");
  await expect(comparison).toContainText("Release status unchanged");
  await expect(comparison).toContainText("score 48 → 48");
  await expect(comparison).toContainText("No findings resolved between these analyses.");
  await expect(comparison).toContainText("INT-API-PORT-MISMATCH");
});

test("marks the synthetic credential resolved by stable ID and preserves only summaries on refresh", async ({ page }) => {
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("releaseguard.analysis-history.v1") || "[]")[0]);
  expect(before).toBeTruthy();
  expect(before.findings.some((finding) => finding.ruleId === "SEC-HARDCODED-CREDENTIAL")).toBe(true);

  const currentResponse = await page.request.post("http://localhost:8090/api/analyze");
  const simulatedAfter = await currentResponse.json();
  const resolvedFinding = simulatedAfter.findings.find((finding) => finding.ruleId === "SEC-HARDCODED-CREDENTIAL");
  expect(resolvedFinding).toBeTruthy();
  simulatedAfter.analysisId = "browser-test-after-synthetic-removal";
  simulatedAfter.analyzedAt = new Date().toISOString();
  simulatedAfter.findings = simulatedAfter.findings.filter((finding) => finding.id !== resolvedFinding.id);
  simulatedAfter.score += 2;
  simulatedAfter.metrics.issuesFound -= 1;
  simulatedAfter.metrics.warnings -= 1;
  simulatedAfter.categories.find((category) => category.name === "Security").summary = "1 open finding(s) require review.";
  simulatedAfter.releasePlan = simulatedAfter.releasePlan
    .filter((step) => step.relatedFindingId !== resolvedFinding.id)
    .map((step, index) => ({ ...step, priority: index + 1 }));

  await page.route("**/api/analyze", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(simulatedAfter),
  }));
  const analyzeResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Re-run ReleaseGuard" }).click();
  expect((await analyzeResponse).ok()).toBeTruthy();

  const activeFindings = findingsList(page);
  await expect(activeFindings).toHaveCount(6);
  await expect(page.locator('[aria-label="Filtered release findings"]').getByText("Synthetic credential sentinel is present", { exact: true })).toHaveCount(0);
  const comparison = page.locator('[aria-label="Selected before and after comparison"]');
  await expect(comparison).toContainText("SEC-HARDCODED-CREDENTIAL");
  await expect(comparison).toContainText("Synthetic credential sentinel is present");
  await expect(comparison).toContainText("Score delta");
  await expect(comparison).toContainText("+2");

  let persisted = await page.evaluate(() => localStorage.getItem("releaseguard.analysis-history.v1"));
  expect(persisted).toContain("browser-test-after-synthetic-removal");
  expect(persisted).not.toContain("demo-only-not-a-secret");
  expect(persisted).not.toContain("spring.datasource.password");

  await page.unroute("**/api/analyze");
  await page.reload();
  persisted = await page.evaluate(() => localStorage.getItem("releaseguard.analysis-history.v1"));
  expect(persisted).toContain("browser-test-after-synthetic-removal");
  const refreshedHistory = JSON.parse(persisted);
  expect(refreshedHistory.length).toBeLessThanOrEqual(10);
  expect(refreshedHistory.some((run) => run.analysisId === "browser-test-after-synthetic-removal")).toBe(true);
});

test("selects independent BEFORE and AFTER analysis runs", async ({ page }) => {
  const analysisResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST",
    { timeout: 45_000 },
  );
  await page.getByRole("button", { name: "Analyze repository now" }).click();
  expect((await analysisResponse).ok()).toBeTruthy();

  const before = page.getByLabel("Before analysis", { exact: true });
  const after = page.getByLabel("After analysis", { exact: true });
  await expect(before.locator("option")).toHaveCount(2);
  await expect(after.locator("option")).toHaveCount(2);
  const beforeId = await before.inputValue();
  const afterId = await after.inputValue();
  expect(beforeId).not.toBe(afterId);

  await before.selectOption({ index: 0 });
  await after.selectOption({ index: 1 });
  await expect(page.getByLabel("Selected before and after comparison")).toBeVisible();
  await expect(page.getByLabel("Selected before and after comparison")).toContainText("Score delta");
});
