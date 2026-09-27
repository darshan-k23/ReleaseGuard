# warning-only-service

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
- Missing deployment documentation: No DEPLOYMENT.md or release procedure documentation
- Dependency maintenance warning: Uses floating semver range (^4.19.2) without package-lock.json
- All builds and tests pass cleanly without blocker errors
