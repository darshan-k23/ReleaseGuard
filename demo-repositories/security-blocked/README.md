# security-blocked-service

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
- Synthetic credential sentinel: Checked-in password literal ('demo-only-not-a-secret')
- Verbose logging: DEBUG logging enabled in application.properties
