/**
 * EdgeOne Pages Function 入口 —— catch-all 路由。
 *
 * 放置位置 functions/api/[[path]].js 会匹配所有 /api/* 请求，
 * 交由 edgeone/lib/router.js 统一分发。这样只用一个函数文件、零路由歧义。
 *
 * 它只做两件事：
 *   1. 解析 EdgeOne 注入的 KV 命名空间绑定（绑定时设的变量名：DB）
 *   2. 把请求交给 router 处理
 */
import { handleRequest, setEnv } from "../../edgeone/lib/router.js";

export async function onRequest(context) {
  // 注入环境变量（Edge 运行时下只有 context.env，没有 process.env）。
  setEnv(context?.env || null);

  // EdgeOne 会把 KV 命名空间按「绑定的变量名」注入。
  // 请在 EdgeOne 控制台绑定命名空间时，把变量名设为 DB。
  let kv = null;

  // 方式 A：作为全局变量注入（EdgeOne KV 文档的标准用法）
  try {
    // eslint-disable-next-line no-undef
    if (typeof DB !== "undefined") kv = DB;
  } catch (e) {
    /* 未注入则忽略 */
  }

  // 方式 B / C：兜底——从 globalThis 或 context.env 读取
  if (!kv && typeof globalThis.DB !== "undefined") kv = globalThis.DB;
  if (!kv && context?.env?.DB) kv = context.env.DB;

  return handleRequest(context, kv);
}
