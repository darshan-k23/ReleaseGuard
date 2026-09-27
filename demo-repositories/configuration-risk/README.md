# configuration-risk-service

ReleaseGuard Demo Repository

## Build & Run
Run production build:
```bash
npm run build
```

Run test suite:
```bash
npm test
```

## Configuration
Configure through environment settings and environment variables:
- `PORT`: HTTP listen port (default 8080)
- Profile activation via `application.properties`

See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment and release procedure.

## Intentional Baseline Conditions
Intentional baseline conditions:
- Integration port mismatch: Frontend API client targets port 3000 while backend listens on port 8080
- Missing production profile: No application-prod.properties file present
- Schema auto-update: Development DDL update enabled in default configuration
