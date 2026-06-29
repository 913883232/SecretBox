"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { decryptString, encryptString } from "@/lib/crypto-client";
import type { Folder, Note, NoteVisibility } from "@/lib/types";
import { Button, Modal, Spinner, Toggle } from "@/components/ui";
import {
  IconLock,
  IconGlobe,
  IconCopy,
  IconCheck,
  IconTrash,
  IconLink,
} from "@/components/icons";

function folderPath(id: string, folders: Folder[]): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard < 50) {
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    guard++;
  }
  return parts.join(" / ");
}

interface EditorProps {
  open: boolean;
  note: Note | null;
  defaultFolderId: string | null;
  folders: Folder[];
  requireKey: () => Promise<CryptoKey | null>;
  onClose: () => void;
  onSaved: (note: Note) => void;
  onDeleted: (id: string) => void;
  onNotice: (message: string) => void;
}

export function NoteEditor({
  open,
  note,
  defaultFolderId,
  folders,
  requireKey,
  onClose,
  onSaved,
  onDeleted,
  onNotice,
}: EditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [encrypted, setEncrypted] = useState(false);
  const [visibility, setVisibility] = useState<NoteVisibility>("private");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError("");
    setReady(false);
    (async () => {
      if (note) {
        setTitle(note.title);
        setEncrypted(note.encrypted);
        setVisibility(note.visibility);
        setFolderId(note.folderId);
        if (note.encrypted) {
          const key = await requireKey();
          if (!active) return;
          if (key) {
            try {
              setContent(await decryptString(note.content, key));
              setLocked(false);
            } catch {
              setContent("");
              setLocked(true);
            }
          } else {
            setContent("");
            setLocked(true);
          }
        } else {
          setContent(note.content);
          setLocked(false);
        }
      } else {
        setTitle("");
        setContent("");
        setEncrypted(false);
        setVisibility("private");
        setFolderId(defaultFolderId);
        setLocked(false);
      }
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [open, note, defaultFolderId, requireKey]);

  function toggleEncrypted(v: boolean) {
    if (v === encrypted) return;
    if (v) {
      setVisibility("private");
      setEncrypted(true);
    } else {
      setEncrypted(false);
    }
  }

  function toggleVisibility(v: boolean) {
    const next: NoteVisibility = v ? "public" : "private";
    if (next === "public") setEncrypted(false);
    setVisibility(next);
  }

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function copyShareLink() {
    if (!note?.shareId) return;
    const url = `${window.location.origin}/share?id=${note.shareId}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function save() {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      let contentToSend = content;
      if (encrypted) {
        const key = await requireKey();
        if (!key) {
          setError("需要解锁保险库后才能保存加密笔记");
          setSaving(false);
          return;
        }
        contentToSend = await encryptString(content, key);
      }
      const body = {
        title: title.trim() || "无标题",
        content: contentToSend,
        encrypted,
        visibility,
        folderId,
      };
      if (note) {
        const { note: updated } = await api.patch<{ note: Note }>(
          `/api/notes/${note.id}`,
          body
        );
        onSaved(updated);
        onNotice("已保存");
      } else {
        const { note: created } = await api.post<{ note: Note }>(
          "/api/notes",
          body
        );
        onSaved(created);
        onNotice("已创建");
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!note) return;
    if (!window.confirm("确定删除这条笔记吗？此操作不可撤销。")) return;
    try {
      await api.del(`/api/notes/${note.id}`);
      onDeleted(note.id);
      onNotice("已删除");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  }

  async function unlockHere() {
    if (!note) return;
    const key = await requireKey();
    if (key) {
      try {
        setContent(await decryptString(note.content, key));
        setLocked(false);
      } catch {
        /* ignore */
      }
    }
  }

  const showShareLink = visibility === "public" && !!note?.shareId;

  return (
    <Modal open={open} onClose={onClose} wide title={note ? "编辑笔记" : "新建笔记"}>
      {!ready ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Spinner className="h-5 w-5" />
        </div>
      ) : locked ? (
        <div className="py-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-500">
            <IconLock width={24} height={24} />
          </span>
          <h3 className="mt-4 font-semibold text-slate-900">需要解锁才能查看</h3>
          <p className="mt-1 text-sm text-slate-500">
            这是一条加密笔记，请先解锁保险库。
          </p>
          <Button className="mt-4" onClick={unlockHere}>
            立即解锁
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-medium focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />

          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="粘贴链接、API 密钥或任意文本……"
              rows={10}
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <button
              type="button"
              onClick={copyContent}
              className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200 hover:text-slate-700"
            >
              {copied ? (
                <>
                  <IconCheck width={12} height={12} /> 已复制
                </>
              ) : (
                <>
                  <IconCopy width={12} height={12} /> 复制
                </>
              )}
            </button>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              所在文件夹
            </span>
            <select
              value={folderId ?? ""}
              onChange={(e) => setFolderId(e.target.value || null)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value="">未分类</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {folderPath(f.id, folders)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                  <IconLock width={15} height={15} className="text-indigo-500" />{" "}
                  客户端加密
                </div>
                <p className="mt-0.5 text-xs text-slate-500">仅你能解密查看</p>
              </div>
              <Toggle
                checked={encrypted}
                onChange={toggleEncrypted}
                disabled={visibility === "public"}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                  <IconGlobe
                    width={15}
                    height={15}
                    className="text-emerald-500"
                  />{" "}
                  公开分享
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {visibility === "public" ? "任何人可凭链接查看" : "仅自己可见"}
                </p>
              </div>
              <Toggle
                checked={visibility === "public"}
                onChange={toggleVisibility}
              />
            </div>
          </div>

          {showShareLink && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                公开链接
              </span>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/share?id=${note?.shareId}`}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600"
                />
                <Button
                  variant="secondary"
                  onClick={copyShareLink}
                  className="shrink-0"
                >
                  {linkCopied ? (
                    <IconCheck width={16} height={16} />
                  ) : (
                    <IconLink width={16} height={16} />
                  )}
                  {linkCopied ? "已复制" : "复制链接"}
                </Button>
              </div>
            </div>
          )}

          {visibility === "public" && !showShareLink && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
              保存后将生成公开分享链接（公开笔记不可加密）。
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <div>
              {note && (
                <Button
                  variant="ghost"
                  className="text-rose-600 hover:bg-rose-50"
                  onClick={remove}
                >
                  <IconTrash width={16} /> 删除
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                取消
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Spinner />} 保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
