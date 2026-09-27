# release-ready-service

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
This repository is a clean release candidate:
- All unit and build tests pass deterministically
- Configuration is properly externalized with an explicit production profile
- Frontend API client port (8080) aligns with the backend server port (8080)
- Deployment guide and release procedures are fully documented in DEPLOYMENT.md
- Dependencies are locked with package-lock.json
