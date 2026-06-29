import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Exercise the store with a read so the healthcheck proves the
    // storage backend (local files or EdgeOne KV) is reachable.
    await store.get("__health__");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
