# EdgeOne 后端部署说明

本目录是部署到**腾讯云 EdgeOne Pages** 的生产后端（Pages Function + Blob 存储）。
它和仓库里的 Next.js 版（`src/`）逻辑完全一致，只是运行环境不同。

> 目标：**只用 EdgeOne，不依赖任何第三方数据库或服务器。**

## 文件结构

```
functions/
  api/
    [[path]].js     ← EdgeOne 入口（catch-all，匹配所有 /api/*）
edgeone/
  lib/
    router.js       ← 后端核心：Blob 封装 + 密码哈希 + 会话 + 路由分发
  README.md         ← 本文件
```

- `functions/api/[[path]].js`：EdgeOne Pages 按文件系统路由识别它为通配符，
  所有 `/api/*` 请求都会进到这里，再交给 `edgeone/lib/router.js`。
- 两个文件是**唯一**的线上后端代码，自包含、无 npm 依赖（只用 EdgeOne 运行时的 Web Crypto）。

## 部署步骤

### 1. 构建前端静态 SPA

```bash
node scripts/export-static.mjs
# 产物在 ./out（index.html、dashboard.html、share.html …，纯静态）
```

### 2. 设置环境变量

在项目设置 → **环境变量** 中配置：

| 变量 | 值 |
|------|----|
| `SESSION_SECRET` | 强随机串，用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成 |

### 3. 部署

- **GitHub 集成**：把仓库连接到 EdgeOne Pages，构建命令填
  `node scripts/export-static.mjs`，输出目录填 `out`。`functions/` 会被自动识别。
- **CLI 部署**：`edgeone pages deploy ./out`（`functions/` 在项目根目录会被一起带上）。

部署后：
- 前端页面 → EdgeOne 静态托管（`out/`）
- `/api/*` 请求 → `functions/api/[[path]].js` → 读写 EdgeOne Blob

## 工作原理

- **同源**：前端和 `/api/*` 在同一域名下，浏览器用相对路径 `/api/...` 调用，无跨域问题。
- **CSRF**：写操作（POST/PATCH/DELETE）要求带 `x-csrf: 1` 头，前端已自动加上。
- **加密**：浏览器端用 Web Crypto（AES-GCM）加密后才上传，后端只存密文——和本地版完全一致。

## 数据 key 方案（与本地版互通）

```
u:email:<email>  -> { id }
u:<id>           -> 用户（含 PBKDF2 密码哈希）
k:<userId>       -> 加密信封 { salt, wrappedKey }
f:<userId>:<fid> -> 文件夹
n:<userId>:<nid> -> 笔记（可能为密文）
s:<shareId>      -> { userId, noteId }   公开分享索引
```

