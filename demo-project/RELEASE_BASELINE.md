# ShopSphere Release Baseline

This file documents the seven deliberate ReleaseGuard baseline cases. Every
credential value here is synthetic; this repository must never contain a
real password, token, API key, or production credential. IBM Bob is the
separate remediation step. ReleaseGuard inspects the checked-in source and
runs the local checks; it does not use findings from JSON fixtures.

## 1. Synthetic credential marker

- **File:** `backend/src/main/resources/application.properties`
- **Expected rule:** `SEC-HARDCODED-CREDENTIAL`
- **Marker:** `demo-only-not-a-secret`
- **Why safe:** This exact sentinel is visibly fake, is not read by
  authentication code, and cannot authenticate to any service. It exists
  only to prove the detector works and is reported at low severity.
- **Expected ReleaseGuard behavior:** Return one low-severity finding with
  the exact property line as evidence. Environment placeholders and other
  documented examples remain exempt.
- **Expected IBM Bob remediation:** Remove the marker or replace it with an
  environment reference; never substitute a real secret.

## 2. Missing production profile

- **File:** `backend/src/main/resources/application.properties`
- **Expected rule:** `CFG-MISSING-PRODUCTION-PROFILE`
- **Why safe:** ShopSphere is a local demo and is not deployed. No production
  profile is needed to run its unit tests or package the backend.
- **Expected ReleaseGuard behavior:** Report that no `application-prod` or
  `application-production` profile exists, anchored to the default config.
- **Expected IBM Bob remediation:** Add a profile only after a real target
  environment and its non-secret settings are specified.

## 3. Deterministic authentication test failure

- **File:** `backend/src/test/java/com/shopsphere/AuthServiceTest.java`
- **Expected rule:** `TEST-BACKEND-FAILED`
- **Mismatch:** The test expects a 3600-second TTL; `AuthService` returns
  1800 seconds.
- **Why safe:** This is a fixed assertion mismatch. It uses no clock boundary,
  network, database, random data, or real credential, so the failure is
  deterministic.
- **Expected ReleaseGuard behavior:** Maven reports three tests with exactly
  one failure and includes the failing test output. The check is `FAIL`, not
  `NOT RUN`.
- **Expected IBM Bob remediation:** Confirm the intended TTL with the owner,
  then align the test or implementation and rerun the backend tests.

## 4. DEBUG logging

- **File:** `backend/src/main/resources/application.properties`
- **Expected rule:** `SEC-DEBUG-LOGGING`
- **Setting:** `logging.level.root=DEBUG`
- **Why safe:** This demo has no production deployment or real user data; the
  setting does not imply that credentials or request bodies are logged.
- **Expected ReleaseGuard behavior:** Report the exact DEBUG property line as
  a medium-severity configuration finding.
- **Expected IBM Bob remediation:** Change the default to INFO/WARN and enable
  DEBUG only in an explicitly selected local diagnostic profile.

## 5. Frontend/backend port mismatch

- **Files:** `frontend/src/api/client.js` and
  `backend/src/main/resources/application.properties`
- **Expected rule:** `INT-API-PORT-MISMATCH`
- **Values:** Frontend API base uses port 9090; backend listens on 8080.
- **Why safe:** Both endpoints are local demo values. No external host or
  service is contacted by the analyzer.
- **Expected ReleaseGuard behavior:** Compare both source lines and include
  the frontend line plus related backend port evidence.
- **Expected IBM Bob remediation:** Agree on the demo API port and update the
  client/configuration consistently.

## 6. Missing deployment documentation

- **File:** `README.md`; `DEPLOYMENT.md` is intentionally absent.
- **Expected rule:** `DOC-DEPLOYMENT-RELEASE-PROCEDURE-MISSING`
- **Why safe:** ShopSphere is not a production deployment target; inventing a
  deployment procedure would be misleading.
- **Expected ReleaseGuard behavior:** Report the missing deployment/release
  guide and cite the README's local-only/non-production context.
- **Expected IBM Bob remediation:** Draft deployment documentation only after
  an actual target and operational requirements are chosen.

## 7. Dependency maintenance policy warning

- **File:** `frontend/package.json`; `frontend/package-lock.json` is
  intentionally absent.
- **Expected rule:** `DEP-NPM-RANGE-WITHOUT-LOCKFILE`
- **Policy:** NPM version ranges are allowed only when an adjacent
  `package-lock.json` pins the resolved install. A floating range without a
  lockfile is a reproducibility warning. This policy says nothing about
  global latest versions, age, or vulnerabilities.
- **Why safe:** The warning is based only on manifest syntax and the missing
  lockfile. It is not a vulnerability or support-status claim.
- **Expected ReleaseGuard behavior:** Report the first range (currently the
  React entry) with its exact manifest line and state that no live CVE source
  was queried.
- **Expected IBM Bob remediation:** Generate and review a lockfile using the
  intended npm version, then update it deliberately with dependency changes.

## Baseline expectations

A fresh analysis should produce these seven rule findings. The intentional
TTL test failure and the port mismatch keep the release decision blocked.
The frontend and backend package builds should succeed; the backend test
check should report one deterministic failure. See `README.md` for local
commands and `../docs/IBM_BOB_WORKFLOW.md` for the manual remediation loop.
