"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { deriveKek, unwrapMasterKey } from "@/lib/crypto-client";
import { setMasterKey } from "@/lib/key-vault";
import type { KeyEnvelope, UserPublic } from "@/lib/types";
import { Button, Spinner, TextField } from "@/components/ui";
import { IconShield, IconEye, IconEyeOff } from "@/components/icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const data = await api.post<{ user: UserPublic; keyEnvelope: KeyEnvelope | null }>(
        "/api/auth/login",
        { email, password }
      );
      if (data.keyEnvelope) {
        // Derive the key locally and unlock the vault so encrypted notes are readable.
        const kek = await deriveKek(password, data.keyEnvelope.salt);
        const master = await unwrapMasterKey(data.keyEnvelope.wrappedKey, kek);
        await setMasterKey(master);
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请重试");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2 font-semibold text-slate-900"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white">
            <IconShield width={20} height={20} />
          </span>
          密匣
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">欢迎回来</h1>
          <p className="mt-1 text-sm text-slate-500">登录以查看你的加密笔记</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <TextField
              label="邮箱"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                密码
              </span>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                  aria-label={show ? "隐藏密码" : "显示密码"}
                >
                  {show ? <IconEyeOff width={18} /> : <IconEye width={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Spinner />}
              {loading ? "登录中…" : "登录"}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          还没有账号？{" "}
          <Link href="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
            立即注册
          </Link>
        </p>
      </div>
    </div>
  );
}
