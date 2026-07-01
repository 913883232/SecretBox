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
const PBKDF2_ITER = 10000; // lowered for Edge runtime (no native PBKDF2); still adequate for a personal notes app
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
// Pure-JS SHA-256 (EdgeOne runtime rejects crypto.subtle.importKey for PBKDF2).
const SHA256_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);
function rotr(x,n){return (x>>>n)|(x<<(32-n));}
function sha256Bytes(msg){ // msg: Uint8Array -> Uint8Array(32)
  const H=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const l=msg.length; const bitLen=l*8;
  const withPad=new Uint8Array(l+9+((64-((l+9)%64))%64));
  withPad.set(msg);
  withPad[l]=0x80;
  // 64-bit big-endian length (we only fill low 32 bits; messages are small)
  const hi=Math.floor(bitLen/0x100000000); const lo=bitLen>>>0;
  withPad[withPad.length-8]=(hi>>>24)&255; withPad[withPad.length-7]=(hi>>>16)&255; withPad[withPad.length-6]=(hi>>>8)&255; withPad[withPad.length-5]=hi&255;
  withPad[withPad.length-4]=(lo>>>24)&255; withPad[withPad.length-3]=(lo>>>16)&255; withPad[withPad.length-2]=(lo>>>8)&255; withPad[withPad.length-1]=lo&255;
  const W=new Uint32Array(64);
  for(let i=0;i<withPad.length;i+=64){
    for(let t=0;t<16;t++){ W[t]=(withPad[i+t*4]<<24)|(withPad[i+t*4+1]<<16)|(withPad[i+t*4+2]<<8)|withPad[i+t*4+3]; }
    for(let t=16;t<64;t++){ const s0=rotr(W[t-15],7)^rotr(W[t-15],18)^(W[t-15]>>>3); const s1=rotr(W[t-2],17)^rotr(W[t-2],19)^(W[t-2]>>>10); W[t]=(W[t-16]+s0+W[t-7]+s1)|0; }
    let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(let t=0;t<64;t++){ const S1=rotr(e,6)^rotr(e,11)^rotr(e,25); const ch=(e&f)^(~e&g); const t1=(h+S1+ch+SHA256_K[t]+W[t])|0; const S0=rotr(a,2)^rotr(a,13)^rotr(a,22); const mj=(a&b)^(a&c)^(b&c); const t2=(S0+mj)|0; h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0; }
    H[0]=(H[0]+a)|0;H[1]=(H[1]+b)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0;
  }
  const out=new Uint8Array(32);
  for(let i=0;i<8;i++){ out[i*4]=(H[i]>>>24)&255;out[i*4+1]=(H[i]>>>16)&255;out[i*4+2]=(H[i]>>>8)&255;out[i*4+3]=H[i]&255; }
  return out;
}
function hmacSha256Bytes(key, msg){ // key,msg: Uint8Array -> Uint8Array(32)
  const BLOCK=64;
  let k=key;
  if(k.length>BLOCK) k=sha256Bytes(k);
  const ipad=new Uint8Array(BLOCK), opad=new Uint8Array(BLOCK);
  for(let i=0;i<BLOCK;i++){ ipad[i]=k[i]^0x36; opad[i]=k[i]^0x5c; }
  const inner=new Uint8Array(BLOCK+msg.length); inner.set(ipad); inner.set(msg,BLOCK);
  const innerHash=sha256Bytes(inner);
  const outer=new Uint8Array(BLOCK+32); outer.set(opad); outer.set(innerHash,BLOCK);
  return sha256Bytes(outer);
}
function xor32(a,b){ const o=new Uint8Array(32); for(let i=0;i<32;i++)o[i]=a[i]^b[i]; return o; }
// PBKDF2-SHA256 using native crypto.subtle.digest when available (fast),
// pure-JS fallback otherwise.
const _digest = (typeof crypto!=="undefined" && crypto.subtle && crypto.subtle.digest)
  ? (buf)=>crypto.subtle.digest("SHA-256",buf).then(ab=>new Uint8Array(ab))
  : null;
async function _hmacAsync(key, msg){
  const BLOCK=64;
  let k=key;
  if(k.length>BLOCK) k=new Uint8Array(await _digest(k));
  const ipad=new Uint8Array(BLOCK), opad=new Uint8Array(BLOCK);
  for(let i=0;i<BLOCK;i++){ ipad[i]=k[i]^0x36; opad[i]=k[i]^0x5c; }
  const inner=new Uint8Array(BLOCK+msg.length); inner.set(ipad); inner.set(msg,BLOCK);
  const innerHash=new Uint8Array(await _digest(inner));
  const outer=new Uint8Array(BLOCK+32); outer.set(opad); outer.set(innerHash,BLOCK);
  return new Uint8Array(await _digest(outer));
}
async function pbkdf2Sha256(password, salt, iterations, dkLen){
  const out=new Uint8Array(dkLen);
  const blocks=Math.ceil(dkLen/32);
  for(let blk=1;blk<=blocks;blk++){
    const saltBlk=new Uint8Array(salt.length+4);
    saltBlk.set(salt);
    saltBlk[salt.length]=(blk>>>24)&255;saltBlk[salt.length+1]=(blk>>>16)&255;saltBlk[salt.length+2]=(blk>>>8)&255;saltBlk[salt.length+3]=blk&255;
    let U=await _hmacAsync(password,saltBlk);
    let T=U.slice();
    for(let i=1;i<iterations;i++){ U=await _hmacAsync(password,U); T=xor32(T,U); }
    const off=(blk-1)*32;
    for(let i=0;i<32&&off+i<dkLen;i++) out[off+i]=T[i];
  }
  return out;
}
async function deriveBits(password, salt, iterations) {
  const pw=enc.encode(password);
  const st=salt instanceof Uint8Array ? salt : new Uint8Array(salt);
  const iter=Number(iterations)|0;
  const bits=await pbkdf2Sha256(pw, st, iter, 32);
  return bits;
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
function hmacSecretBytes() { return enc.encode(sessionSecret()); }
// Pure-JS HMAC-SHA256 helpers (EdgeOne runtime rejects crypto.subtle.importKey).
async function hmacSign(msgStr) { if(_digest) return await _hmacAsync(hmacSecretBytes(), enc.encode(msgStr)); return hmacSha256Bytes(hmacSecretBytes(), enc.encode(msgStr)); }
async function hmacVerify(msgStr, sigBytes) {
  const expected = await hmacSign(msgStr);
  if (expected.length !== sigBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ sigBytes[i];
  return diff === 0;
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
  const ok = await hmacVerify(body, b64d(sig));
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
  const sig = b64u(await hmacSign(body));
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
