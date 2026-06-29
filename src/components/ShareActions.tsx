"use client";

import { useState } from "react";
import { IconCopy, IconCheck } from "@/components/icons";

export function ShareActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mt-6 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
      >
        {copied ? (
          <IconCheck width={16} height={16} />
        ) : (
          <IconCopy width={16} height={16} />
        )}
        {copied ? "已复制" : "复制全部内容"}
      </button>
    </div>
  );
}
