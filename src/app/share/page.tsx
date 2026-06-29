"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { PublicNote } from "@/lib/types";
import { IconShield, IconCopy } from "@/components/icons";
import { ShareActions } from "@/components/ShareActions";
import { Spinner } from "@/components/ui";

const URL_RE = /(https?:\/\/[^\s]+)/g;

interface Segment {
  text: string;
  url?: string;
}

function linkify(content: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: content.slice(lastIndex, match.index) });
    }
    segments.push({ text: match[0], url: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex) });
  }
  return segments;
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("zh-CN");
  } catch {
    return value;
  }
}

function ShareView() {
  const params = useSearchParams();
  const shareId = params.get("id") || "";
  const [note, setNote] = useState<PublicNote | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    if (!shareId) {
      setState("missing");
      return;
    }
    let active = true;
    api
      .get<{ note: PublicNote }>(`/api/public/${encodeURIComponent(shareId)}`)
      .then((d) => {
        if (active) {
          setNote(d.note);
          setState("ok");
        }
      })
      .catch(() => {
        if (active) setState("missing");
      });
    return () => {
      active = false;
    };
  }, [shareId]);

  if (state === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <Spinner className="h-6 w-6 text-indigo-500" />
      </div>
    );
  }

  if (state === "missing" || !note) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-200 text-slate-500">
          <IconShield width={24} height={24} />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">笔记不可见</h1>
        <p className="mt-1 text-sm text-slate-500">
          该笔记不存在，或已被作者设为私有。
        </p>
        <Link
          href="/"
          className="mt-6 text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          返回首页
        </Link>
      </div>
    );
  }

  const segments = linkify(note.content);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">
              <IconShield width={18} height={18} />
            </span>
            密匣
          </div>
          <Link
            href="/register"
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            创建自己的加密笔记
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600">
          <IconCopy width={12} height={12} /> 公开分享
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
          {note.title}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          更新于 {formatDate(note.updatedAt)}
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800">
            {segments.map((seg, i) =>
              seg.url ? (
                <a
                  key={i}
                  href={seg.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-500"
                >
                  {seg.text}
                </a>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
          </div>

          {note.content && <ShareActions content={note.content} />}
        </div>
      </main>
    </div>
  );
}

export default function SharePage() {
  // useSearchParams must be inside a Suspense boundary for static export.
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-slate-50">
          <Spinner className="h-6 w-6 text-indigo-500" />
        </div>
      }
    >
      <ShareView />
    </Suspense>
  );
}
