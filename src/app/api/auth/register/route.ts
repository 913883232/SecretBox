import {
  createUser,
  findUserByEmail,
  saveUserKey,
} from "@/lib/store/data";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { isCsrfOk, jsonError, readJson } from "@/lib/server-utils";

export const dynamic = "force-dynamic";

interface RegisterBody {
  email?: unknown;
  password?: unknown;
  salt?: unknown;
  wrappedKey?: unknown;
}

export async function POST(request: Request) {
  if (!isCsrfOk(request)) return jsonError("请求无效", 400);
  const body = await readJson<RegisterBody>(request);
  if (!body) return jsonError("请求格式错误", 400);

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const salt = String(body.salt ?? "");
  const wrappedKey = String(body.wrappedKey ?? "");

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return jsonError("请输入有效的邮箱地址", 400);
  if (password.length < 8) return jsonError("密码至少需要 8 位字符", 400);
  if (!salt || !wrappedKey) return jsonError("缺少加密参数", 400);

  if (await findUserByEmail(email))
    return jsonError("该邮箱已被注册", 409);

  const user = await createUser(email, await hashPassword(password));
  await saveUserKey(user.id, { salt, wrappedKey });
  await createSession({ id: user.id, email: user.email });

  return Response.json({ user: { id: user.id, email: user.email } });
}
