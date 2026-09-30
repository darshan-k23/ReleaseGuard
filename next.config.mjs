/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Pages Router tracing: ship the demo repositories (read at runtime via
    // fs) alongside the /api catch-all serverless function.
    outputFileTracingIncludes: {
      "/api/[...path]": ["./demo-repositories/**/*", "./demo-project/**/*"],
    },
  },
  async rewrites() {
    // Dev only: proxy /api to the Express API started by scripts/dev.mjs.
    // In production the pages/api catch-all route handles /api directly, so
    // rewrites must stay disabled there (afterFiles rewrites would shadow it).
    if (process.env.API_PROXY_TARGET) {
      return [
        {
          source: "/api/:path*",
          destination: `${process.env.API_PROXY_TARGET}/api/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
