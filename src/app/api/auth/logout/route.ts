import { clearSession } from "@/lib/session";
import { isCsrfOk, jsonError } from "@/lib/server-utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCsrfOk(request)) return jsonError("请求无效", 400);
  await clearSession();
  return Response.json({ ok: true });
}
