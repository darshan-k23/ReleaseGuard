# ShopSphere

ShopSphere is the deliberately imperfect repository used by the ReleaseGuard
baseline demo. It is a local fixture, not a production application.

## Stack

- **Frontend:** React + Vite
- **Backend:** Spring Boot 3.5.16, Java 25, Maven

## Local commands

Backend, from `backend/`:

```bash
mvn spring-boot:run
mvn -DskipTests package
```

Frontend, from `frontend/`:

```bash
npm install
npm run build
npm run dev
```

The backend listens on port 8080. The frontend API client intentionally
targets port 9090 for the baseline mismatch.

## Configuration

`backend/src/main/resources/application.properties` contains a synthetic
password detector marker only. `demo-only-not-a-secret` is not a usable
credential and must never be replaced with a real one. The baseline has no
production profile. No database is required by this demo.

## Demo dependency policy

NPM version ranges are permitted only when an adjacent `package-lock.json`
pins the resolved install. A floating range without a lockfile is a
reproducibility warning only; it does not assert that a version is old or
vulnerable. ReleaseGuard does not query a vulnerability database.

Deployment instructions are intentionally absent. See
[`RELEASE_BASELINE.md`](RELEASE_BASELINE.md) for the baseline cases and their
expected remediation.
