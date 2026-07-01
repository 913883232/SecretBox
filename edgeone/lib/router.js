import { store } from "./store-blob.js";
/**
 * EdgeOne Pages Function 后端核心逻辑（自包含、仅依赖 EdgeOne 运行时）。
 *
 * 与仓库里 Next.js 版（src/）使用完全相同的：
 *   - 存储 key 方案（u: / k: / f: / n: / s: 前缀）
 *   - 加密信封格式（salt + wrappedKey）
 *   - 密码哈希（PBKDF2-SHA256）与会话签名（HMAC-SHA256，httpOnly Cookie）
 * 因此本地（Next.js + 文件存储）与线上（EdgeOne Pages Blob）的数据互通、行为一致。
 *
 * 导出 handleRequest(context)：
 *   context —— EdgeOne 注入的请求上下文（含 request 等）
 *   存储由 ./store-blob.js 使用 EdgeOne Pages Blob 自动初始化。
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const PBKDF2_ITER = 200000;
const SESSION_COOKIE = "mn_session";
const SESSION_TTL = 7 * 24 * 60 * 60; // 秒

// ---------------------------------------------------------------- base64
function b64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of view) s += String.fromCharCode(b);
  return btoa(s);
}
function b64d(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64u(bytes) {
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------- 密码哈希
async function deriveBits(password, salt, iterations) {
  const iter = Number(iterations) | 0;
  const sView = new Uint8Array(salt instanceof ArrayBuffer ? new Uint8Array(salt) : salt);
  const saltBuf = sView.buffer.slice(sView.byteOffset, sView.byteOffset + sView.byteLength);
  const pwU8 = enc.encode(password);
  const pwBuf = pwU8.buffer.slice(pwU8.byteOffset, pwU8.byteOffset + pwU8.byteLength);
  let base;
  try {
    base = await crypto.subtle.importKey("raw", pwBuf, { name: "PBKDF2" }, false, ["deriveBits"]);
  } catch (e1) {
    try { base = await crypto.subtle.importKey("raw", pwU8, { name: "PBKDF2" }, false, ["deriveBits"]); }
    catch (e2) { throw new Error("importKey failed: ["+e1.message+"] then ["+e2.message+"] pwBuf.len="+pwBuf.byteLength); }
  }
  let bits;
  try {
    bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBuf, iterations: iter, hash: "SHA-256" }, base, 256);
  } catch (e3) {
    throw new Error("deriveBits failed: "+e3.message+" | salt.len="+saltBuf.byteLength+" iter="+iter+" typeof iter="+(typeof iterations));
  }
  return new Uint8Array(bits);
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(hash)}`;
}
async function verifyPassword(password, stored) {
  const [algo, iterStr, saltB64, hashB64] = stored.split("$");
  if (algo !== "pbkdf2") return false;
  const iter = Number(iterStr);
  if (!iter) return false;
  const expected = b64d(hashB64);
  const hash = await deriveBits(password, b64d(saltB64), iter);
  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];
  return diff === 0;
}

// ---------------------------------------------------------------- 会话 Cookie
// env 由入口从 context.env 注入；Edge 运行时下 process.env 可能不存在，
// 因此优先用注入的 env，再回退到 process.env（Node/Cloud Function 下可用）。
let appEnv = null;
export function setEnv(env) {
  appEnv = env || null;
}
function envValue(name) {
  if (appEnv && appEnv[name] != null) return appEnv[name];
  try {
    if (typeof process !== "undefined" && process.env && process.env[name] != null)
      return process.env[name];
  } catch (e) {
    /* ignore */
  }
  return undefined;
}
function sessionSecret() {
  return (
    envValue("SESSION_SECRET") || "dev-only-insecure-session-secret-min-16-chars"
  );
}
let hmacKey;
async function getHmacKey() {
  if (!hmacKey) {
    hmacKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(sessionSecret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
  }
  return hmacKey;
}
function parseCookies(header) {
  const out = {};
  (header || "")
    .split(";")
    .forEach((p) => {
      const i = p.indexOf("=");
      if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });
  return out;
}
async function readSession(req) {
  const token = parseCookies(req.headers.get("cookie") || "")[SESSION_COOKIE];
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await getHmacKey(),
    b64d(sig),
    enc.encode(body)
  );
  if (!ok) return null;
  try {
    const p = JSON.parse(dec.decode(b64d(body)));
    if (p.exp && Date.now() > p.exp) return null;
    return p.sub && p.email ? { id: p.sub, email: p.email } : null;
  } catch {
    return null;
  }
}
async function buildSessionCookie(user) {
  const now = Date.now();
  const payload = JSON.stringify({
    sub: user.id,
    email: user.email,
    iat: now,
    exp: now + SESSION_TTL * 1000,
  });
  const body = b64u(enc.encode(payload));
  const sig = b64u(
    await crypto.subtle.sign("HMAC", await getHmacKey(), enc.encode(body))
  );
  return `${SESSION_COOKIE}=${body}.${sig}; HttpOnly; Path=/; Max-Age=${SESSION_TTL}; SameSite=Lax${
    envValue("NODE_ENV") === "production" ? "; Secure" : ""
  }`;
}
const CLEAR_COOKIE = `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;

// ---------------------------------------------------------------- 数据层
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const shareId = () => b64u(crypto.getRandomValues(new Uint8Array(9)));

async function findUserByEmail(store, email) {
  const ref = await store.get(`u:email:${email}`);
  return ref ? store.get(`u:${ref.id}`) : null;
}

async function reconcileShare(store, note) {
  if (note.visibility === "public" && note.shareId) {
    await store.put(`s:${note.shareId}`, {
      userId: note.userId,
      noteId: note.id,
    });
  }
  if (note.visibility !== "public" && note.shareId) {
    await store.del(`s:${note.shareId}`);
  }
}

// ---------------------------------------------------------------- HTTP 工具
function json(data, status = 200, cookie) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (cookie) headers["set-cookie"] = cookie;
  return new Response(JSON.stringify(data), { status, headers });
}
async function readBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
/** 浏览器在同源下带 x-csrf 头发起写请求；缺失则拒绝（防 CSRF）。 */
function isMutation(method) {
  return ["POST", "PATCH", "PUT", "DELETE"].includes(method);
}

// ---------------------------------------------------------------- 主处理
export async function handleRequest(context) {
  const req = context.request;
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, ""); // 去掉尾部斜杠
  const method = req.method;

  // 写操作要求带自定义 CSRF 头（浏览器同源请求才会带）。
  if (isMutation(method) && req.headers.get("x-csrf") !== "1") {
    return json({ error: "请求无效" }, 400);
  }

  // ---- /api/auth/register ----
  if (path === "/api/auth/register" && method === "POST") {
    const b = await readBody(req);
    if (!b) return json({ error: "请求格式错误" }, 400);
    const email = String(b.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return json({ error: "请输入有效的邮箱地址" }, 400);
    if (String(b.password || "").length < 8)
      return json({ error: "密码至少需要 8 位字符" }, 400);
    if (!b.salt || !b.wrappedKey) return json({ error: "缺少加密参数" }, 400);
    if (await findUserByEmail(store, email))
      return json({ error: "该邮箱已被注册" }, 409);

    const user = {
      id: uuid(),
      email,
      passwordHash: await hashPassword(String(b.password)),
      createdAt: now(),
    };
    await store.put(`u:${user.id}`, user);
    await store.put(`u:email:${email}`, { id: user.id });
    await store.put(`k:${user.id}`, {
      salt: String(b.salt),
      wrappedKey: String(b.wrappedKey),
    });
    return json(
      { user: { id: user.id, email } },
      200,
      await buildSessionCookie(user)
    );
  }

  // ---- /api/auth/login ----
  if (path === "/api/auth/login" && method === "POST") {
    const b = await readBody(req);
    const email = String(b?.email || "").trim().toLowerCase();
    const user = await findUserByEmail(store, email);
    if (!user || !(await verifyPassword(String(b?.password || ""), user.passwordHash)))
      return json({ error: "邮箱或密码错误" }, 401);
    const keyEnvelope = await store.get(`k:${user.id}`);
    return json(
      { user: { id: user.id, email: user.email }, keyEnvelope },
      200,
      await buildSessionCookie(user)
    );
  }

  // ---- /api/auth/logout ----
  if (path === "/api/auth/logout" && method === "POST") {
    return json({ ok: true }, 200, CLEAR_COOKIE);
  }

  // ---- /api/auth/me ----
  if (path === "/api/auth/me" && method === "GET") {
    const user = await readSession(req);
    return json({ user });
  }

  // ---- /api/auth/key ----
  if (path === "/api/auth/key" && method === "GET") {
    const user = await readSession(req);
    if (!user) return json({ error: "未登录或会话已过期" }, 401);
    const keyEnvelope = await store.get(`k:${user.id}`);
    if (!keyEnvelope) return json({ error: "未找到加密信息" }, 404);
    return json({ keyEnvelope });
  }

  // ---- /api/folders (GET list / POST create) ----
  if (path === "/api/folders" && method === "GET") {
    const user = await readSession(req);
    if (!user) return json({ error: "未登录或会话已过期" }, 401);
    const keys = await store.list(`f:${user.id}:`);
    const folders = (await Promise.all(keys.map((k) => store.get(k)))).filter(
      Boolean
    );
    return json({ folders });
  }
  if (path === "/api/folders" && method === "POST") {
    const user = await readSession(req);
    if (!user) return json({ error: "未登录或会话已过期" }, 401);
    const b = await readBody(req);
    const name = String(b?.name || "").trim();
    if (!name) return json({ error: "文件夹名称不能为空" }, 400);
    const folder = {
      id: uuid(),
      userId: user.id,
      parentId: b?.parentId ? String(b.parentId) : null,
      name,
      createdAt: now(),
    };
    await store.put(`f:${user.id}:${folder.id}`, folder);
    return json({ folder });
  }

  // ---- /api/folders/[id] (PATCH rename / DELETE) ----
  if (path.startsWith("/api/folders/") && (method === "PATCH" || method === "DELETE")) {
    const user = await readSession(req);
    if (!user) return json({ error: "未登录或会话已过期" }, 401);
    const id = path.split("/")[3];
    const key = `f:${user.id}:${id}`;
    const folder = await store.get(key);
    if (!folder) return json({ error: "文件夹不存在" }, 404);

    if (method === "PATCH") {
      const b = await readBody(req);
      const name = String(b?.name || "").trim();
      if (!name) return json({ error: "文件夹名称不能为空" }, 400);
      folder.name = name;
      await store.put(key, folder);
      return json({ folder });
    }
    // DELETE：把其中的笔记移到未分类，再删除文件夹
    const noteKeys = await store.list(`n:${user.id}:`);
    const notes = (await Promise.all(noteKeys.map((k) => store.get(k)))).filter(
      Boolean
    );
    await Promise.all(
      notes
        .filter((n) => n.folderId === id)
        .map((n) => {
          n.folderId = null;
          return store.put(`n:${user.id}:${n.id}`, n);
        })
    );
    await store.del(key);
    return new Response(null, { status: 204 });
  }

  // ---- /api/notes (GET list / POST create) ----
  if (path === "/api/notes" && method === "GET") {
    const user = await readSession(req);
    if (!user) return json({ error: "未登录或会话已过期" }, 401);
    const folderId = url.searchParams.get("folderId");
    let notes = (
      await Promise.all(
        (await store.list(`n:${user.id}:`)).map((k) => store.get(k))
      )
    ).filter(Boolean);

    if (folderId && folderId !== "all") {
      notes =
        folderId === "unfiled"
          ? notes.filter((n) => !n.folderId)
          : notes.filter((n) => n.folderId === folderId);
    }
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    if (q) {
      // 密文不可搜索，仅匹配标题（加密笔记）或内容（普通笔记）。
      notes = notes.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          (!n.encrypted && n.content.toLowerCase().includes(q))
      );
    }
    notes.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return json({ notes });
  }
  if (path === "/api/notes" && method === "POST") {
    const user = await readSession(req);
    if (!user) return json({ error: "未登录或会话已过期" }, 401);
    const b = await readBody(req);
    const encrypted = b?.encrypted === true;
    const visibility = b?.visibility === "public" ? "public" : "private";
    if (encrypted && visibility === "public")
      return json({ error: "公开笔记无法加密，请先设为私有" }, 400);

    const note = {
      id: uuid(),
      userId: user.id,
      folderId: b?.folderId ? String(b.folderId) : null,
      title: String(b?.title || "").trim() || "无标题",
      content: String(b?.content ?? ""),
      encrypted,
      visibility,
      shareId: visibility === "public" ? shareId() : null,
      createdAt: now(),
      updatedAt: now(),
    };
    await store.put(`n:${user.id}:${note.id}`, note);
    await reconcileShare(store, note);
    return json({ note });
  }

  // ---- /api/notes/[id] (GET / PATCH / DELETE) ----
  if (path.startsWith("/api/notes/") && (method === "GET" || method === "PATCH" || method === "DELETE")) {
    const user = await readSession(req);
    if (!user) return json({ error: "未登录或会话已过期" }, 401);
    const id = path.split("/")[3];
    const key = `n:${user.id}:${id}`;
    const note = await store.get(key);
    if (!note) return json({ error: "笔记不存在" }, 404);

    if (method === "GET") {
      return json({ note });
    }
    if (method === "DELETE") {
      if (note.shareId) await store.del(`s:${note.shareId}`);
      await store.del(key);
      return new Response(null, { status: 204 });
    }
    // PATCH
    const b = await readBody(req);
    if (b.title !== undefined)
      note.title = String(b.title).trim() || "无标题";
    if (b.content !== undefined) note.content = String(b.content);
    if (b.encrypted !== undefined) note.encrypted = b.encrypted === true;
    if (b.folderId !== undefined)
      note.folderId = b.folderId ? String(b.folderId) : null;
    if (b.visibility !== undefined) {
      note.visibility = b.visibility === "public" ? "public" : "private";
      if (note.visibility === "public" && !note.shareId) note.shareId = shareId();
    }
    const encrypted = note.encrypted;
    const visibility = note.visibility;
    if (encrypted && visibility === "public")
      return json({ error: "公开笔记无法加密，请先设为私有" }, 400);
    note.updatedAt = now();
    await store.put(key, note);
    await reconcileShare(store, note);
    return json({ note });
  }

  // ---- /api/public/[shareId] (GET，无需登录) ----
  if (path.startsWith("/api/public/") && method === "GET") {
    const sid = decodeURIComponent(path.split("/")[3] || "");
    const ref = await store.get(`s:${sid}`);
    if (!ref) return json({ error: "笔记不存在或已被设为私有" }, 404);
    const note = await store.get(`n:${ref.userId}:${ref.noteId}`);
    if (!note || note.visibility !== "public")
      return json({ error: "笔记不存在或已被设为私有" }, 404);
    return json({
      note: {
        title: note.title,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      },
    });
  }

  return json({ error: "Not found" }, 404);
}
