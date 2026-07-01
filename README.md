# 密匣 · 加密同步笔记 (MemoVault)

自托管的在线备忘录：保存收藏链接、记录 API 密钥，支持**文件夹分类**、
**多设备同步**、**公开 / 私有分享**，以及对敏感内容的**浏览器端加密**。

**前端是纯静态 SPA，后端是无服务端函数**——可 100% 部署到腾讯云 EdgeOne
Pages（静态托管 + Pages Function），**不依赖任何第三方数据库或服务器**。

## ✨ 功能

- **注册 / 登录**：邮箱 + 密码；会话用 HMAC 签名的 httpOnly Cookie。
- **客户端加密**：浏览器内置 Web Crypto（AES-GCM 256）。密码经 PBKDF2(20 万次)
  在本地派生密钥解开随机主密钥，主密钥再加密每条敏感笔记。**后端只存密文**。
- **文件夹分类**：多级嵌套目录，像电脑里的文件夹。
- **私有 / 公开**：默认私有；单条可切公开并生成 `/share/?id=` 分享链接。
- **多设备同步**：数据在云端存储，任意设备登录即可查看。

## 🧱 架构（纯静态 SPA + 无服务器 API）

| 部分 | 技术 | 运行位置 |
|------|------|----------|
| **前端** | Next.js 导出的**纯静态 SPA**（HTML/CSS/JS，无 SSR） | EdgeOne Pages 静态托管 |
| **后端 API** | **EdgeOne Pages Function**（仅依赖 EdgeOne 运行时，无 npm 依赖） | EdgeOne Pages Functions |
| **数据存储** | **EdgeOne Pages Blob**（对象存储） | EdgeOne |

> 前端所有页面都是客户端组件，没有任何 SSR / 服务端取数依赖。
> 后端密码哈希与会话签名全部用 Web Crypto，能跑在 Edge 运行时。

存储键名（扁平、可按前缀遍历，匹配 EdgeOne Blob 的 `list(prefix)`）：

```
u:email:<email>   -> { id }
u:<id>            -> 用户（含密码哈希）
k:<userId>        -> 加密信封 { salt, wrappedKey }
f:<userId>:<fid>  -> 文件夹
n:<userId>:<nid>  -> 笔记
s:<shareId>       -> { userId, noteId }  公开分享索引
```

## 🚀 本地开发与测试

仓库里自带一个**本地全栈环境**（Next.js dev + 本地文件存储），开箱即用：

```bash
npm install
cp .env.example .env          # STORAGE_DRIVER=local，无需任何数据库
npm run dev                   # 打开 http://localhost:3000
```

本地数据落在 `.local-data/store.json`（已 gitignore）。`npm run dev` 时前端 SPA
与本地的 Next.js API（基于文件存储）同源运行，可完整测试注册/登录/加密/分享。

> 生成强随机会话密钥：
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## ☁️ 部署到 EdgeOne（100% 在 EdgeOne 上）

### 1) 构建纯静态 SPA

```bash
node scripts/export-static.mjs
```

- 该脚本会临时把 `src/app/api` 移走（因为路由处理函数不能被静态导出），
  执行 `output: "export"`，再恢复原状。
- 产物在 **`./out`**：`index.html`、`dashboard/`、`share/`、`login/`、`register/` 等，
  全是静态文件，**无任何服务端代码**。

### 2) 部署静态站点 + 后端 API

后端已经是现成的 `functions/` 目录（**开箱即用**，详见
[`edgeone/README.md`](./edgeone/README.md)）：

```
functions/api/[[path]].js   ← 匹配所有 /api/* 请求
edgeone/lib/router.js       ← 后端核心逻辑（Blob + 密码 + 会话 + 路由）
```

部署配置如下（Blob 会自动初始化，无需手动绑定 KV）：

1. **Blob 存储**：EdgeOne Pages Blob 会自动按 `secret-box` 名称初始化，无需在控制台手动创建或绑定 KV 命名空间。
2. **环境变量**：设置 `SESSION_SECRET` 为强随机串
   （`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`）。
3. **部署**：
   - GitHub 集成：构建命令 `node scripts/export-static.mjs`，输出目录 `out`，
     `functions/` 会被自动识别。
   - 或 CLI：`edgeone pages deploy ./out`。

部署后，前端页面走 EdgeOne 静态托管，`/api/*` 自动走 Pages Function 读写 EdgeOne Blob，
两者同域，前端用相对路径 `/api/...` 调用即可。

> 后端代码自包含、零 npm 依赖（只用 EdgeOne 运行时的 Web Crypto），
> 与本地 Next.js 版逻辑完全一致。

### 可选：更短的分享链接

默认分享链接是 `/share?id=<shareId>`（静态页面读 query 参数，兼容所有静态托管）。
若想要 `/s/<shareId>` 这种短链，在 EdgeOne 配置一条重写规则即可：
`/s/:id` → `/share?id=:id`。

## 🔐 安全模型

```
注册/登录（浏览器内）：密码 --PBKDF2--> KEK；随机主密钥 --(KEK)--> wrappedKey（上传密文）
查看（浏览器内，登录后）：密码 --PBKDF2--> KEK --解开--> masterKey --解密--> 明文
```

> ⚠️ 忘记密码将无法解密已加密笔记（端到端加密的固有特性），请妥善保管。
> 主密钥仅存于当前标签页内存 / sessionStorage，关闭即清。

## 🧹 彻底清理

所有依赖、构建产物与本地数据都在项目目录内，删除即净：

```bash
rm -rf node_modules .next out .local-data
```

`.gitignore` 已忽略 `.env` / `node_modules` / `.next` / `out` / `.local-data`，可放心传 GitHub。

## 📁 目录结构

```
src/                       # 本地开发用的 Next.js 全栈应用（SPA + 本地 API）
  app/
    api/                   # 本地开发/测试用 API（静态导出时会被脚本临时移走）
    share/                 # 公开分享页（静态，读 ?id= 查询参数）
    dashboard/             # 主界面（纯客户端组件）
  components/              # UI（Dashboard/NoteEditor/FolderTree/icons/ui）
  lib/
    crypto-client          # 浏览器端 AES-GCM 加解密
    password.ts            # Web Crypto 密码哈希
    session.ts             # Web Crypto 会话 Cookie
    store/                 # 存储抽象：types / local / edgeone / index / data
functions/
  api/[[path]].js          # ★ EdgeOne 生产后端入口（catch-all，匹配所有 /api/*）
edgeone/
  lib/router.js            # ★ EdgeOne 生产后端核心（Blob + 密码 + 会话 + 路由）
  README.md                # EdgeOne 部署详细说明
scripts/
  export-static.mjs        # 构建纯静态 SPA（产物 ./out）
edgeone/
  pages-function-reference.js  # EdgeOne Pages Function 版后端（生产）
```
