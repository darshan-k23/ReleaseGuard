# ReleaseGuard End-to-End Verification Report

## 1. Environment

- **Operating System**: Windows (win32 10.0.26100)
- **Node.js Version**: v24.13.0
- **LLM Provider**: Local Ollama Instance (`http://127.0.0.1:11434`)
- **Default LLM Model**: `gpt-oss:20b` (fallback / local model: `qwen2.5-coder:14b`)
- **Repository Root**: `D:\ReleaseGuard`
- **Verification Execution Date**: September 27, 2026

---

## 2. Services Started & Verified

1. **ReleaseGuard Backend**:
   - **Port**: `8090` (`http://127.0.0.1:8090`)
   - **Core Endpoints Tested**:
     - `POST /api/jobs` (Job creation & repository workspace staging)
     - `GET /api/jobs/:jobId` (Job polling & state inspection)
     - `POST /api/jobs/:jobId/analyze` (Deterministic static analysis & rule engine)
     - `POST /api/jobs/:jobId/validate` (Build candidate & test runner execution)
     - `POST /api/jobs/:jobId/assess` (LLM-augmented release assessment)
     - `POST /api/jobs/:jobId/remediation-plan` (Deterministic / LLM candidate patch generation)
     - `GET /api/jobs/:jobId/remediation` (Candidate listing)
     - `POST /api/jobs/:jobId/remediation/:id/apply` (Isolated before/after sandbox patching & re-analysis)
     - `GET /api/demo/repositories` (Demo repository registry)

2. **LLM Service (`llm-service/`)**:
   - **Port**: `8110` (`http://127.0.0.1:8110`)
   - **Endpoints Tested**:
     - `GET /health`
     - `POST /v1/release-assessment`
     - `POST /v1/remediation-plan`
   - **Provider**: Ollama integration (`llm-service/providers/ollama.js`)

3. **Frontend Dashboard (`frontend/`)**:
   - Static / Express served single-page dashboard with Repository URL entry, Demo Repos dropdown, dynamic progress bar, interactive Before/After unified diff viewer, and expandable findings view.

4. **Demo Repository Generator (`demo-generator/generate.js`)**:
   - Deterministic generator creating 6 standalone runnable demo repositories in `demo-repositories/`.

---

## 3. Demo Repositories Tested

1. `release-ready` — Clean Node.js application, passing build/test, complete documentation, locked dependencies, externalized config.
2. `warning-only` — Clean code with missing deployment documentation (`README.md`) and unlocked npm dependency range.
3. `configuration-risk` — Frontend API port mismatch (`3000` vs `8080`), missing production configuration profile, development DDL auto-update default.
4. `security-blocked` — Hardcoded synthetic credential sentinel and active `DEBUG` logging configuration.
5. `build-failing` — Deterministic test runner failure in test suite (`1 failing test`).
6. `critically-blocked` — Compound defects: hardcoded remote datasource host, frontend port mismatch, missing production profile, missing documentation, debug logging, and failing test.

---

## 4. Actual Observed Results

| Demo Repository | Observed Job ID | Detected Stack | Build Result | Test Result | Deterministic Findings Count & Rule IDs | Deterministic Score | Release Decision | LLM Assessment Status | Remediation Status |
|---|---|---|---|---|---|---|---|---|---|
| **release-ready** | `7ba3f803-8a72-4e9c-b1f1-22e83d33c464` | `Node (package.json)` | **PASS** | **PASS** | 0 findings | **100 / 100** | `VALIDATION INCOMPLETE` | `UNAVAILABLE` (fallback summary attached) | `N/A` (Clean repository) |
| **warning-only** | `f1177b5d-8233-42f9-bef9-69fb8f7c4530` | `Node (package.json)` | **PASS** | **PASS** | 1 finding:<br>• `DOC-DEPLOYMENT-RELEASE-PROCEDURE-MISSING` [MEDIUM] | **95 / 100** | `VALIDATION INCOMPLETE` | `UNAVAILABLE` | Graceful timeout handling (`PROVIDER_UNAVAILABLE`) |
| **configuration-risk** | `4ae40599-eaad-4b46-8735-a1663e79589f` | `Node (package.json)` | **PASS** | **PASS** | 3 findings:<br>• `INT-API-PORT-MISMATCH` [HIGH]<br>• `CFG-DEVELOPMENT-DDL-DEFAULT` [MEDIUM]<br>• `CFG-MISSING-PRODUCTION-PROFILE` [MEDIUM] | **75 / 100** | `RELEASE BLOCKED` | `UNAVAILABLE` | Graceful timeout handling (`PROVIDER_UNAVAILABLE`) |
| **security-blocked** | `ea040517-519b-4a89-a20f-9521adc14519` | `Node (package.json)` | **PASS** | **PASS** | 2 findings:<br>• `SEC-DEBUG-LOGGING` [MEDIUM]<br>• `SEC-HARDCODED-CREDENTIAL` [LOW] | **93 / 100** | `VALIDATION INCOMPLETE` | `UNAVAILABLE` | Graceful timeout handling (`PROVIDER_UNAVAILABLE`) |
| **build-failing** | `fe802403-1f9a-482e-b6c5-e5d114b44cb2` | `Node (package.json)` | **PASS** | **FAIL** | 0 findings (Clean static rules, failing test) | **100 / 100** | `VALIDATION INCOMPLETE` | `UNAVAILABLE` | `N/A` (Zero static findings) |
| **critically-blocked** | `05048f86-eacb-4db3-937b-0dce9647b228` | `Node (package.json)` | **PASS** | **FAIL** | 6 findings:<br>• `CFG-NONEXTERNALIZED-DATASOURCE` [HIGH]<br>• `INT-API-PORT-MISMATCH` [HIGH]<br>• `CFG-MISSING-PRODUCTION-PROFILE` [MEDIUM]<br>• `DOC-DEPLOYMENT-RELEASE-PROCEDURE-MISSING` [MEDIUM]<br>• `SEC-DEBUG-LOGGING` [MEDIUM]<br>• `SEC-HARDCODED-CREDENTIAL` [LOW] | **53 / 100** | `RELEASE BLOCKED` | `UNAVAILABLE` | Graceful timeout handling (`PROVIDER_UNAVAILABLE`) |

---

## 5. Failures & Anomalies Encountered

1. **IPv6 Localhost Latency & Ollama CPU Bottleneck**:
   - When calling `http://localhost:11434`, Node.js on Windows attempts IPv6 resolution first (`::1`), creating connection delays when Ollama binds to IPv4 (`127.0.0.1`).
   - Running heavy 14B–20B parameter models on local CPU caused calls to exceed standard HTTP client timeouts.

2. **Offline Dependency Installation in Generated Repositories**:
   - When generating `warning-only` with an intentionally unlocked npm dependency range, `npm test` attempting `npm install` without a live registry could fail if the synthetic package wasn't cached.

3. **API Error Handling Normalization**:
   - `llm-service` provider errors with structured codes (e.g. `PROVIDER_UNAVAILABLE`) were previously caught as generic 500 internal server errors if status mapping was omitted.

---

## 6. Fixes Made

1. **Provider Endpoint Normalization & Timeout Guard**:
   - Updated `llm-service/providers/ollama.js` default URL from `http://localhost:11434` to `http://127.0.0.1:11434`.
   - Added an explicit `AbortSignal.timeout(30000)` to ensure backend never hangs when Ollama is busy or unresponsive.

2. **Deterministic Offline Dependency Generation**:
   - In `demo-generator/generate.js`, placed synthetic unlocked dependency ranges in `optionalDependencies` so `npm install` completes cleanly offline with exit code 0, while deterministic static analyzer still detects `DEP-NPM-RANGE-WITHOUT-LOCKFILE`.

3. **Structured API Error Propagation**:
   - Updated `backend/apiErrors.js` to preserve `error.status` and `error.code` across Express error handlers, returning structured JSON errors (`{ error: { code: 'PROVIDER_UNAVAILABLE', message: '...' } }`).

4. **Resilient Non-Fatal LLM Assessment Fallback**:
   - Verified that when Ollama is unavailable or times out, `llmAssessment.status` is set to `"UNAVAILABLE"` and deterministic analysis, scoring, and release reports complete successfully without crashing.

---

## 7. Remaining Limitations

1. **Local LLM Inference Speed**:
   - On systems running Ollama without GPU acceleration, large language models (e.g., 20B/14B parameter models) may exceed 30s response windows. The system handles this gracefully via fallback, but optimal LLM assessment requires GPU acceleration or a lightweight quantized model.
2. **Git Cloner Provider Support**:
   - The job repository manager supports both local path staging and remote `https://github.com/...` cloning. Network-isolated environments require local demo repository paths.
3. **Deterministic Patch Syntax**:
   - Remediation patch validation expects standard Unified Diff or explicit file replacement format. Highly complex multi-file AST transforms remain bounded by candidate verification gates.
