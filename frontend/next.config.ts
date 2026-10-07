import path from "node:path";
import type { NextConfig } from "next";

/**
 * The frontend is the subsystem's only public origin. /api/* and the central
 * SSO endpoints go on to the NestJS backend, so the callback registered in the
 * Core Hub (http://localhost:3002/auth/callback) and the HttpOnly session
 * cookie it sets live on the same origin as these pages.
 *
 * next build bakes these rewrites into the build, so BACKEND_URL is read at
 * build time only: from .env in development, and from frontend/Dockerfile
 * (http://api:4000) in the image (deployment.md 3.2).
 */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3003";

const nextConfig: NextConfig = {
  // deployment.md 3: the image ships only the traced standalone server (DEP-04)
  output: "standalone",
  // pnpm keeps dependencies at the workspace root (the repo root), so tracing
  // has to start there or the standalone bundle misses them
  outputFileTracingRoot: path.join(__dirname, ".."),
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/auth/login", destination: `${BACKEND_URL}/auth/login` },
      { source: "/auth/callback", destination: `${BACKEND_URL}/auth/callback` },
      { source: "/auth/logout", destination: `${BACKEND_URL}/auth/logout` },
    ];
  },
};

export default nextConfig;
