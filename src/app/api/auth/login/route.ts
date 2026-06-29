import { findUserByEmail, getUserKey } from "@/lib/store/data";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { isCsrfOk, jsonError, readJson } from "@/lib/server-utils";
import type { KeyEnvelope } from "@/lib/types";

export const dynamic = "force-dynamic";

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  if (!isCsrfOk(request)) return jsonError("请求无效", 400);
  const body = await readJson<LoginBody>(request);
  if (!body) return jsonError("请求格式错误", 400);

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return jsonError("请输入邮箱和密码", 400);

  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return jsonError("邮箱或密码错误", 401);
  }

  const keyEnvelope = await getUserKey(user.id);
  await createSession({ id: user.id, email: user.email });

  return Response.json({
    user: { id: user.id, email: user.email },
    keyEnvelope: keyEnvelope as KeyEnvelope | null,
  });
}
