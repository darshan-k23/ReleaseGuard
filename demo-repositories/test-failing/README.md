# test-failing-service

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
- Deterministic test failure: 'npm test' fails assertion
- Blocks release evaluation gate via execution validation
