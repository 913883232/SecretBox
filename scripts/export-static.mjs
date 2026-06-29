#!/usr/bin/env node
/**
 * Build a PURE STATIC SPA for Tencent EdgeOne Pages.
 *
 * Why this script exists:
 *   Next.js `output: "export"` cannot statically export API route handlers.
 *   In production the backend API is served by the EdgeOne Pages Function
 *   (see edgeone/pages-function-reference.js), so the Next.js API routes are
 *   only needed for local dev / the sandbox. This build temporarily moves
 *   `src/app/api` aside, runs the static export, then restores it.
 *
 * Usage:
 *   node scripts/export-static.mjs
 *
 * Output:
 *   ./out  (deploy this directory to EdgeOne Pages static hosting)
 *
 * Notes:
 *   - Set EXPORT_STATIC is handled here automatically.
 *   - The app talks to the API via relative paths (/api/...). On EdgeOne, map
 *     /api/* to the Pages Function (or serve them from the same domain).
 */
import { execSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const apiDir = join(root, "src", "app", "api");
// Stash OUTSIDE src/app so Next.js does not scan it as routes.
const apiStash = join(root, ".api__disabled");
const outDir = join(root, "out");

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  if (existsSync(apiStash)) {
    if (existsSync(apiDir)) rmSync(apiDir, { recursive: true, force: true });
    renameSync(apiStash, apiDir);
    console.log("✓ Restored src/app/api");
  }
}
process.on("exit", restore);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

console.log("→ Building static SPA for EdgeOne…");

// 1. Move API routes aside so they don't break the export.
if (existsSync(apiDir)) {
  renameSync(apiDir, apiStash);
  console.log("✓ Temporarily moved src/app/api aside");
}

// 2. Run the static export (next.config picks up EXPORT_STATIC).
try {
  execSync("npx next build", {
    stdio: "inherit",
    env: { ...process.env, EXPORT_STATIC: "1" },
  });
} catch {
  console.error("✗ Static export failed");
  restore();
  process.exit(1);
}

restore();

// 3. Report.
if (existsSync(outDir)) {
  console.log(`\n✓ Static SPA generated in ./out`);
  console.log("  Deploy ./out to EdgeOne Pages static hosting.");
  console.log("  Map /api/* to the EdgeOne Pages Function for the backend.");
} else {
  console.error("✗ ./out not found after export");
  process.exit(1);
}
