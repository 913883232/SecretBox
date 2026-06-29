"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { decryptString, deriveKek, unwrapMasterKey } from "@/lib/crypto-client";
import {
  getMasterKey,
  loadMasterKey,
  lockVault,
  setMasterKey,
} from "@/lib/key-vault";
import type { Folder, KeyEnvelope, Note, UserPublic } from "@/lib/types";
import { Badge, Button, Modal, Spinner, TextField } from "@/components/ui";
import {
  IconShield,
  IconPlus,
  IconSearch,
  IconNote,
  IconInbox,
  IconLock,
  IconLockOpen,
  IconLogout,
  IconCopy,
  IconCheck,
  IconGlobe,
  IconFolder,
  IconMenu,
  IconClose,
} from "@/components/icons";
import { FolderTree } from "@/components/FolderTree";
import { NoteEditor } from "@/components/NoteEditor";

type View = "all" | "unfiled" | string;

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

interface FolderModalState {
  mode: "new" | "rename";
  parentId: string | null;
  folderId?: string;
  name: string;
}

export function Dashboard({ user }: { user: UserPublic }) {
  const router = useRouter();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorNote, setEditorNote] = useState<Note | null>(null);
  const [editorFolder, setEditorFolder] = useState<string | null>(null);

  // Unlock modal
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const unlockResolver = useRef<((key: CryptoKey | null) => void) | null>(null);

  // Folder modal
  const [folderModal, setFolderModal] = useState<FolderModalState | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);

  // Toast
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 2200);
  }, []);

  // ---- Initial load ----
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [f, n] = await Promise.all([
          api.get<{ folders: Folder[] }>("/api/folders"),
          api.get<{ notes: Note[] }>("/api/notes"),
        ]);
        if (!active) return;
        setFolders(f.folders);
        setNotes(n.notes);
        const ok = await loadMasterKey();
        if (active) setUnlocked(ok);
      } catch {
        if (active) notify("加载失败，请刷新重试");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [notify]);

  // ---- Decrypt previews for the list ----
  useEffect(() => {
    let active = true;
    (async () => {
      const key = getMasterKey();
      const map: Record<string, string> = {};
      for (const n of notes) {
        if (n.encrypted) {
          if (key) {
            try {
              map[n.id] = await decryptString(n.content, key);
            } catch {
              map[n.id] = "";
            }
          } else {
            map[n.id] = "";
          }
        } else {
          map[n.id] = n.content;
        }
      }
      if (active) setPreviews(map);
    })();
    return () => {
      active = false;
    };
  }, [notes, unlocked]);

  // ---- Unlock orchestration ----
  const requireKey = useCallback((): Promise<CryptoKey | null> => {
    const existing = getMasterKey();
    if (existing) return Promise.resolve(existing);
    return new Promise<CryptoKey | null>((resolve) => {
      unlockResolver.current = resolve;
      setUnlockOpen(true);
    });
  }, []);

  const resolveUnlock = useCallback((key: CryptoKey | null) => {
    const r = unlockResolver.current;
    unlockResolver.current = null;
    r?.(key);
  }, []);

  async function doUnlock(e: FormEvent) {
    e.preventDefault();
    if (unlockLoading) return;
    setUnlockLoading(true);
    setUnlockError("");
    try {
      const { keyEnvelope } = await api.get<{ keyEnvelope: KeyEnvelope }>(
        "/api/auth/key"
      );
      const kek = await deriveKek(unlockPassword, keyEnvelope.salt);
      const master = await unwrapMasterKey(keyEnvelope.wrappedKey, kek);
      await setMasterKey(master);
      setUnlocked(true);
      setUnlockOpen(false);
      setUnlockPassword("");
      resolveUnlock(master);
    } catch {
      setUnlockError("密码错误，无法解锁");
    } finally {
      setUnlockLoading(false);
    }
  }

  function cancelUnlock() {
    setUnlockOpen(false);
    setUnlockPassword("");
    setUnlockError("");
    resolveUnlock(null);
  }

  function manualUnlock() {
    unlockResolver.current = null;
    setUnlockOpen(true);
  }

  function manualLock() {
    lockVault();
    setUnlocked(false);
    notify("已锁定保险库");
  }

  // ---- Notes ----
  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (view === "unfiled" && n.folderId !== null) return false;
      if (view !== "all" && view !== "unfiled" && n.folderId !== view)
        return false;
      if (!q) return true;
      if (n.title.toLowerCase().includes(q)) return true;
      const prev = previews[n.id] ?? "";
      return prev.toLowerCase().includes(q);
    });
  }, [notes, view, search, previews]);

  function openNewNote() {
    setEditorNote(null);
    setEditorFolder(view !== "all" && view !== "unfiled" ? view : null);
    setEditorOpen(true);
  }

  function openEditNote(note: Note) {
    setEditorNote(note);
    setEditorOpen(true);
  }

  function onNoteSaved(note: Note) {
    setNotes((prev) => {
      const idx = prev.findIndex((n) => n.id === note.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = note;
        return copy;
      }
      return [note, ...prev];
    });
  }

  function onNoteDeleted(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  async function copyNote(note: Note) {
    try {
      let text = note.content;
      if (note.encrypted) {
        const key = await requireKey();
        if (!key) return;
        text = await decryptString(note.content, key);
      }
      await navigator.clipboard.writeText(text);
      notify("已复制到剪贴板");
    } catch {
      notify("复制失败");
    }
  }

  async function copyShareLink(note: Note) {
    if (!note.shareId) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/share?id=${note.shareId}`
      );
      notify("分享链接已复制");
    } catch {
      notify("复制失败");
    }
  }

  // ---- Folders ----
  function openNewFolder(parentId: string | null = null) {
    setFolderModal({ mode: "new", parentId, name: "" });
  }

  function openRenameFolder(folder: Folder) {
    setFolderModal({
      mode: "rename",
      parentId: folder.parentId,
      folderId: folder.id,
      name: folder.name,
    });
  }

  async function submitFolder(e: FormEvent) {
    e.preventDefault();
    if (!folderModal) return;
    const name = folderModal.name.trim();
    if (!name) return;
    setFolderBusy(true);
    try {
      if (folderModal.mode === "new") {
        const { folder } = await api.post<{ folder: Folder }>("/api/folders", {
          name,
          parentId: folderModal.parentId,
        });
        setFolders((prev) => [...prev, folder]);
        notify("文件夹已创建");
      } else if (folderModal.folderId) {
        const { folder } = await api.patch<{ folder: Folder }>(
          `/api/folders/${folderModal.folderId}`,
          { name }
        );
        setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)));
        notify("已重命名");
      }
      setFolderModal(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : "操作失败");
    } finally {
      setFolderBusy(false);
    }
  }

  async function deleteFolder(folder: Folder) {
    if (
      !window.confirm(
        `删除文件夹「${folder.name}」？其中的笔记会移动到「未分类」。`
      )
    )
      return;
    try {
      await api.del(`/api/folders/${folder.id}`);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      if (view === folder.id) setView("all");
      const { notes: refreshed } = await api.get<{ notes: Note[] }>(
        "/api/notes"
      );
      setNotes(refreshed);
      notify("文件夹已删除");
    } catch (err) {
      notify(err instanceof Error ? err.message : "删除失败");
    }
  }

  async function logout() {
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore */
    }
    lockVault();
    router.push("/login");
  }

  // ---- Derived UI bits ----
  const viewTitle =
    view === "all"
      ? "全部笔记"
      : view === "unfiled"
        ? "未分类"
        : folders.find((f) => f.id === view)?.name ?? "笔记";

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">
          <IconShield width={18} height={18} />
        </span>
        <span className="font-semibold text-slate-900">密匣</span>
      </div>

      <div className="px-3">
        <Button className="w-full justify-start" onClick={openNewNote}>
          <IconPlus width={16} height={16} /> 新建笔记
        </Button>
      </div>

      <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        <NavItem
          active={view === "all"}
          onClick={() => {
            setView("all");
            setSidebarOpen(false);
          }}
          icon={<IconNote width={16} height={16} />}
          label="全部笔记"
          count={notes.length}
        />
        <NavItem
          active={view === "unfiled"}
          onClick={() => {
            setView("unfiled");
            setSidebarOpen(false);
          }}
          icon={<IconInbox width={16} height={16} />}
          label="未分类"
          count={notes.filter((n) => !n.folderId).length}
        />

        <div className="flex items-center justify-between px-2 pb-1 pt-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            文件夹
          </span>
          <button
            type="button"
            onClick={() => openNewFolder(null)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
            title="新建文件夹"
          >
            <IconPlus width={14} height={14} />
          </button>
        </div>

        {folders.length === 0 ? (
          <p className="px-2 py-2 text-xs text-slate-400">
            还没有文件夹，点击 + 创建。
          </p>
        ) : (
          <FolderTree
            folders={folders}
            selectedFolderId={view !== "all" && view !== "unfiled" ? view : null}
            onSelect={(id) => {
              setView(id);
              setSidebarOpen(false);
            }}
            onRename={openRenameFolder}
            onDelete={deleteFolder}
            onNewSub={(parentId) => openNewFolder(parentId)}
          />
        )}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <button
          type="button"
          onClick={unlocked ? manualLock : manualUnlock}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
            unlocked
              ? "text-emerald-700 hover:bg-emerald-50"
              : "text-amber-700 hover:bg-amber-50"
          }`}
        >
          {unlocked ? (
            <IconLockOpen width={16} height={16} />
          ) : (
            <IconLock width={16} height={16} />
          )}
          {unlocked ? "保险库已解锁" : "保险库已锁定"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="absolute right-2 top-3 rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <IconClose width={18} height={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
          >
            <IconMenu width={20} height={20} />
          </button>

          <div className="relative flex-1 max-w-md">
            <IconSearch
              width={16}
              height={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索标题或内容……"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">
              {user.email}
            </span>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <IconLogout width={16} height={16} />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconFolder width={20} height={20} className="text-indigo-500" />
                <h1 className="text-xl font-semibold text-slate-900">
                  {viewTitle}
                </h1>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {filteredNotes.length}
                </span>
              </div>
              <Button variant="secondary" className="md:hidden" onClick={openNewNote}>
                <IconPlus width={16} height={16} /> 新建
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-20 text-slate-400">
                <Spinner className="h-6 w-6" />
              </div>
            ) : filteredNotes.length === 0 ? (
              <EmptyState
                hasNotes={notes.length > 0}
                onNew={openNewNote}
              />
            ) : (
              <ul className="space-y-3">
                {filteredNotes.map((note) => (
                  <li key={note.id}>
                    <NoteCard
                      note={note}
                      preview={previews[note.id]}
                      folderName={
                        note.folderId
                          ? folders.find((f) => f.id === note.folderId)?.name
                          : undefined
                      }
                      onOpen={() => openEditNote(note)}
                      onCopy={() => copyNote(note)}
                      onCopyLink={() => copyShareLink(note)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>

      <NoteEditor
        open={editorOpen}
        note={editorNote}
        defaultFolderId={editorFolder}
        folders={folders}
        requireKey={requireKey}
        onClose={() => setEditorOpen(false)}
        onSaved={onNoteSaved}
        onDeleted={onNoteDeleted}
        onNotice={notify}
      />

      {/* Unlock modal */}
      <Modal
        open={unlockOpen}
        onClose={cancelUnlock}
        title="解锁加密保险库"
      >
        <form onSubmit={doUnlock} className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-indigo-50 px-3 py-2.5 text-xs text-indigo-700">
            <IconLock width={14} height={14} className="mt-0.5 shrink-0" />
            <span>
              输入你的登录密码，将在浏览器本地派生密钥并解开主密钥，用于查看加密笔记。密码不会上传。
            </span>
          </div>
          <TextField
            label="登录密码"
            type="password"
            autoComplete="current-password"
            autoFocus
            placeholder="••••••••"
            value={unlockPassword}
            onChange={(e) => setUnlockPassword(e.target.value)}
          />
          {unlockError && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {unlockError}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={cancelUnlock}>
              取消
            </Button>
            <Button type="submit" disabled={unlockLoading || !unlockPassword}>
              {unlockLoading && <Spinner />} 解锁
            </Button>
          </div>
        </form>
      </Modal>

      {/* Folder modal */}
      <Modal
        open={!!folderModal}
        onClose={() => setFolderModal(null)}
        title={folderModal?.mode === "rename" ? "重命名文件夹" : "新建文件夹"}
      >
        <form onSubmit={submitFolder} className="space-y-4">
          <TextField
            label="文件夹名称"
            autoFocus
            placeholder="例如：API 密钥"
            value={folderModal?.name ?? ""}
            onChange={(e) =>
              setFolderModal((prev) =>
                prev ? { ...prev, name: e.target.value } : prev
              )
            }
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setFolderModal(null)}
            >
              取消
            </Button>
            <Button type="submit" disabled={folderBusy}>
              {folderBusy && <Spinner />} 确定
            </Button>
          </div>
        </form>
      </Modal>

      {/* Toast */}
      {notice && (
        <div className="animate-fade-in fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {notice}
        </div>
      )}
    </div>
  );
}

function NavItem({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-indigo-50 text-indigo-700"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      <span className={active ? "text-indigo-500" : "text-slate-400"}>
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs text-slate-400">{count}</span>
      )}
    </button>
  );
}

function EmptyState({
  hasNotes,
  onNew,
}: {
  hasNotes: boolean;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <IconNote width={24} height={24} />
      </span>
      <h3 className="mt-4 font-semibold text-slate-900">
        {hasNotes ? "这里还没有笔记" : "开始记录你的第一条笔记"}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        粘贴收藏的链接、API 密钥或任何文本。敏感内容可开启客户端加密。
      </p>
      <Button className="mt-5" onClick={onNew}>
        <IconPlus width={16} height={16} /> 新建笔记
      </Button>
    </div>
  );
}

function NoteCard({
  note,
  preview,
  folderName,
  onOpen,
  onCopy,
  onCopyLink,
}: {
  note: Note;
  preview: string | undefined;
  folderName?: string;
  onOpen: () => void;
  onCopy: () => void;
  onCopyLink: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const previewText =
    note.encrypted && (preview === undefined || preview === "")
      ? "🔒 已加密，解锁后查看"
      : (preview ?? "").slice(0, 160);

  return (
    <div className="group flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold text-slate-900">
            {note.title}
          </h3>
          {note.encrypted && (
            <Badge className="bg-indigo-50 text-indigo-600">
              <IconLock width={11} height={11} /> 加密
            </Badge>
          )}
          {note.visibility === "public" && (
            <Badge className="bg-emerald-50 text-emerald-600">
              <IconGlobe width={11} height={11} /> 公开
            </Badge>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500">
          {previewText || "（空）"}
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          {folderName && (
            <span className="inline-flex items-center gap-1">
              <IconFolder width={11} height={11} /> {folderName}
            </span>
          )}
          <span>{formatRelative(note.updatedAt)}</span>
        </div>
      </button>

      <div className="flex shrink-0 flex-col gap-1 opacity-0 transition group-hover:opacity-100 sm:flex-row">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="复制内容"
        >
          {copied ? (
            <IconCheck width={16} height={16} />
          ) : (
            <IconCopy width={16} height={16} />
          )}
        </button>
        {note.visibility === "public" && note.shareId && (
          <button
            type="button"
            onClick={onCopyLink}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
            title="复制分享链接"
          >
            <IconGlobe width={16} height={16} />
          </button>
        )}
      </div>
    </div>
  );
}
