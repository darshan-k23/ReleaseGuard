// Anchor the backend's repo-relative paths BEFORE anything else. These are
// process-global env vars read lazily by the backend at call time (not at
// module evaluation), so ordering relative to the import below is no longer
// load-bearing -- but keeping the overrides first documents the deployment
// contract in one place.
//
// Serverless runtimes only allow writes under /tmp, so job workspaces live
// there; the demo repositories are shipped with the function via
// experimental.outputFileTracingIncludes in next.config.mjs.
process.env.RELEASEGUARD_ROOT ||= process.cwd();
process.env.RELEASEGUARD_WORKSPACES_ROOT ||= "/tmp/releaseguard-workspaces";
process.env.RELEASEGUARD_DEMO_REPOSITORIES_ROOT ||= `${process.cwd()}/demo-repositories`;
process.env.RELEASEGUARD_DEMO_PROJECT_ROOT ||= `${process.cwd()}/demo-project`;

import { createApp } from "../../backend/server.js";

// Share one Express app instance across warm serverless invocations so the
// in-memory job/analysis state survives between requests on the same instance.
globalThis.__releaseguardApp ||= createApp();

// Pages Router API routes receive Node-style req/res, which the Express app
// (a connect-style handler) can serve directly.
export default async function handler(req, res) {
  const app = await globalThis.__releaseguardApp;
  return app(req, res);
}

export const config = {
  api: {
    // Streaming and long-running build/test validation need the raw Node
    // primitives; the Express app manages its own body parsing.
    bodyParser: false,
    externalResolver: true,
  },
};
