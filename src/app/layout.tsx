import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "密匣 · 加密同步笔记",
  description:
    "保存收藏链接、记录 API 密钥的加密在线备忘录。内容在浏览器端加密，只有登录的你才能解密。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
