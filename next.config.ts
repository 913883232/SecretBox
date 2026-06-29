import type { NextConfig } from "next";

/**
 * Static-export toggle.
 *
 * Default (this sandbox + `npm run dev` + `npm run build`):
 *   a normal Next.js server build (API routes active, /api/health available).
 *
 * Production static SPA for EdgeOne (`EXPORT_STATIC=1`):
 *   `output: "export"` produces a pure static site in ./out with NO running
 *   server — the backend API is served by the EdgeOne Pages Function instead.
 *
 *   Because route handlers can't be statically exported, run it via:
 *     node scripts/export-static.mjs
 *   which temporarily moves src/app/api aside during the export.
 */
const nextConfig: NextConfig = {
  output: process.env.EXPORT_STATIC === "1" ? "export" : undefined,
  images: { unoptimized: true },
};

export default nextConfig;
