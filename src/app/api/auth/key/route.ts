import { getUserKey } from "@/lib/store/data";
import { currentUser, jsonError, unauthorized } from "@/lib/server-utils";
import type { KeyEnvelope } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Returns the encryption envelope for the logged-in user (used to re-unlock). */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const keyEnvelope = await getUserKey(user.id);
  if (!keyEnvelope) return jsonError("未找到加密信息", 404);
  return Response.json({ keyEnvelope: keyEnvelope as KeyEnvelope });
}
