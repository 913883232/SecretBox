import { createNote, listNotes } from "@/lib/store/data";
import {
  currentUser,
  isCsrfOk,
  jsonError,
  readJson,
  unauthorized,
} from "@/lib/server-utils";
import type { Note, NoteVisibility } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const folderId = url.searchParams.get("folderId"); // "all" | "unfiled" | uuid | null
  const q = url.searchParams.get("q")?.trim().toLowerCase() || "";

  let notes = await listNotes(user.id);

  if (folderId && folderId !== "all") {
    if (folderId === "unfiled") notes = notes.filter((n) => !n.folderId);
    else notes = notes.filter((n) => n.folderId === folderId);
  }
  if (q) {
    // Never search inside ciphertext — only titles of encrypted notes.
    notes = notes.filter((n) => {
      if (n.title.toLowerCase().includes(q)) return true;
      if (!n.encrypted && n.content.toLowerCase().includes(q)) return true;
      return false;
    });
  }

  notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return Response.json({ notes: notes as Note[] });
}

interface CreateNoteBody {
  title?: unknown;
  content?: unknown;
  encrypted?: unknown;
  visibility?: unknown;
  folderId?: unknown;
}

export async function POST(request: Request) {
  if (!isCsrfOk(request)) return jsonError("请求无效", 400);
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = await readJson<CreateNoteBody>(request);
  if (!body) return jsonError("请求格式错误", 400);

  const encrypted = body.encrypted === true;
  const visibility: NoteVisibility =
    body.visibility === "public" ? "public" : "private";
  if (encrypted && visibility === "public") {
    return jsonError("公开笔记无法加密，请先设为私有", 400);
  }

  const note = await createNote(user.id, {
    title: String(body.title ?? "").trim() || "无标题",
    content: String(body.content ?? ""),
    encrypted,
    visibility,
    folderId: body.folderId ? String(body.folderId) : null,
  });

  return Response.json({ note: note as Note });
}
