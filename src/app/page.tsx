"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session";
import {
  IconShield,
  IconFolder,
  IconRefresh,
  IconGlobe,
  IconLock,
  IconKey,
} from "@/components/icons";

const features = [
  {
    icon: IconLock,
    title: "端到端客户端加密",
    desc: "API 密钥等内容在浏览器内用 AES-GCM 加密后再上传，服务器只保存密文，即使数据库泄露也无法解密。",
  },
  {
    icon: IconFolder,
    title: "文件夹式分类",
    desc: "像电脑里的文件夹一样自由建立多级目录，把链接、密钥、笔记整理得井井有条。",
  },
  {
    icon: IconRefresh,
    title: "多设备同步",
    desc: "数据保存在云端存储，手机、电脑登录同一账号即可随时查看与同步。",
  },
  {
    icon: IconGlobe,
    title: "公开 / 私有",
    desc: "默认完全私有；需要分享时把单条笔记切换为公开，生成链接即可发给他人。",
  },
];

export default function Home() {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white">
            <IconShield width={20} height={20} />
          </span>
          密匣
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            登录
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            免费注册
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 sm:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-100">
              <IconKey width={14} height={14} /> 安全保存链接与 API 密钥
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              你的私人
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                加密备忘录
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              一个可以多设备同步的在线笔记。把收藏的链接、API 密钥粘贴进来，
              敏感内容会自动在浏览器端加密——只有登录的你才能解密查看。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
              >
                开始使用
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50"
              >
                已有账号，登录
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-indigo-200/50 to-violet-200/50 blur-2xl" />
            <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-semibold text-slate-700">
                <IconFolder width={16} height={16} className="text-indigo-500" />
                密钥 / OpenAI
              </div>
              <div className="space-y-3 pt-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>sk-...</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                      <IconLock width={11} height={11} /> 已加密
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-sm tracking-wider text-slate-400">
                    ••••••••••••••••••••
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">收藏链接</div>
                  <div className="mt-1 truncate text-sm text-indigo-600">
                    https://example.com/useful-resource
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <f.icon width={22} height={22} />
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid md:grid-cols-2">
            <div className="p-8 sm:p-10">
              <h2 className="text-2xl font-bold text-slate-900">
                加密发生在你的浏览器里
              </h2>
              <p className="mt-3 text-slate-600">
                登录密码在本地通过 PBKDF2 派生出密钥，用来解开一把随机生成的主密钥；
                主密钥再加密每一条敏感笔记。整个过程不经过服务器，服务器永远只看到密文。
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {[
                  "AES-GCM 256 位对称加密",
                  "PBKDF2（20 万次迭代）派生密钥",
                  "主密钥随机生成、加密存储",
                  "忘记解锁时仅需重新输入密码",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                      <IconShield width={12} height={12} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-8 text-white sm:p-10">
              <div className="text-sm font-medium text-indigo-100">数据流</div>
              <div className="mt-6 space-y-4 font-mono text-sm">
                <div className="rounded-lg bg-white/10 p-3">
                  浏览器: sk-xxxx → AES 加密 → 密文
                </div>
                <div className="text-center text-indigo-200">↓ 仅传输密文</div>
                <div className="rounded-lg bg-white/10 p-3">
                  服务器: 存储 "密文"（无法解读）
                </div>
                <div className="text-center text-indigo-200">↓ 登录后</div>
                <div className="rounded-lg bg-white/10 p-3">
                  浏览器: 密文 → 解密 → sk-xxxx
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-center text-sm text-slate-400">
        密匣 · 加密同步笔记 — 纯静态 SPA + EdgeOne Pages Function
      </footer>
    </div>
  );
}
