import type { NextConfig } from "next";

/**
 * The frontend is the subsystem's only public origin. /api/* and the central
 * SSO endpoints go on to the NestJS backend, so the callback registered in the
 * Core Hub (http://localhost:3002/auth/callback) and the HttpOnly session
 * cookie it sets live on the same origin as these pages.
 */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3003";

const nextConfig: NextConfig = {
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
