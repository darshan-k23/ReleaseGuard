# critically-blocked-service

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



## Intentional Baseline Conditions
Intentional baseline conditions:
- Multiple compound blockers:
  1. Synthetic credential in configuration
  2. Fixed remote production datasource host
  3. Integration port mismatch (9000 vs 8080)
  4. Missing production profile and deployment documentation
  5. Failing automated test suite
