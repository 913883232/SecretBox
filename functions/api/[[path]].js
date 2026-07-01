/**
 * EdgeOne Pages Function 入口 —— catch-all 路由。
 *
 * 放置位置 functions/api/[[path]].js 会匹配所有 /api/* 请求，
 * 交由 edgeone/lib/router.js 统一分发。这样只用一个函数文件、零路由歧义。
 *
 * 存储：由 edgeone/lib/store-blob.js 使用 EdgeOne Pages Blob 自动初始化，
 * 无需在 EdgeOne 控制台手动绑定 KV。
 */
import { handleRequest, setEnv } from "../../edgeone/lib/router.js";

export async function onRequest(context) {
  // 注入环境变量（Edge 运行时下只有 context.env，没有 process.env）。
  setEnv(context?.env || null);

  try {
    return await handleRequest(context);
  } catch (err) {
    // 返回可读的错误信息，避免 EdgeOne 网关返回无意义的 545。
    const msg = (err && (err.stack || err.message)) || String(err);
    return new Response(
      JSON.stringify({ error: "内部错误", detail: msg }),
      { status: 500, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }
}
