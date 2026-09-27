# Deployment & Operations Guide

## Production Deployment & Release Procedure
1. Verify all tests pass: `npm test`
2. Build distributable bundle: `npm run build`
3. Deploy to production environment with required profile:
   ```bash
   NODE_ENV=production npm start
   ```
