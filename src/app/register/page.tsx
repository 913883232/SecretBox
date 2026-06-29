"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  deriveKek,
  generateMasterKey,
  randomSaltB64,
  wrapMasterKey,
} from "@/lib/crypto-client";
import { setMasterKey } from "@/lib/key-vault";
import { Button, Spinner, TextField } from "@/components/ui";
import { IconShield, IconEye, IconEyeOff, IconLock } from "@/components/icons";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError("");

    if (password.length < 8) {
      setError("密码至少需要 8 位字符");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    try {
      // Generate the encryption envelope entirely in the browser.
      const salt = randomSaltB64();
      const kek = await deriveKek(password, salt);
      const master = await generateMasterKey();
      const wrappedKey = await wrapMasterKey(master, kek);

      await api.post("/api/auth/register", {
        email,
        password,
        salt,
        wrappedKey,
      });
      await setMasterKey(master);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败，请重试");
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
          <h1 className="text-xl font-semibold text-slate-900">创建账号</h1>
          <p className="mt-1 text-sm text-slate-500">
            注册即自动为你生成加密密钥
          </p>

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
                  autoComplete="new-password"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="至少 8 位"
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
            <TextField
              label="确认密码"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              placeholder="再次输入密码"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />

            <div className="flex items-start gap-2 rounded-lg bg-indigo-50 px-3 py-2.5 text-xs text-indigo-700">
              <IconLock width={14} height={14} className="mt-0.5 shrink-0" />
              <span>
                你的密码会被用来在本地派生加密密钥。请务必牢记——一旦遗忘，已加密的内容将无法恢复。
              </span>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Spinner />}
              {loading ? "创建中…" : "注册并登录"}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          已有账号？{" "}
          <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            直接登录
          </Link>
        </p>
      </div>
    </div>
  );
}
