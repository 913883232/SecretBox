import { deleteNote, getNote, updateNote } from "@/lib/store/data";
import {
  currentUser,
  isCsrfOk,
  jsonError,
  readJson,
  unauthorized,
} from "@/lib/server-utils";
import type { Note, NoteVisibility } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const note = await getNote(user.id, id);
  if (!note) return jsonError("笔记不存在", 404);
  return Response.json({ note: note as Note });
}

interface UpdateNoteBody {
  title?: unknown;
  content?: unknown;
  encrypted?: unknown;
  visibility?: unknown;
  folderId?: unknown;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isCsrfOk(request)) return jsonError("请求无效", 400);
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const body = await readJson<UpdateNoteBody>(request);
  if (!body) return jsonError("请求格式错误", 400);

  const patch: {
    title?: string;
    content?: string;
    encrypted?: boolean;
    visibility?: NoteVisibility;
    folderId?: string | null;
  } = {};

  if (body.title !== undefined)
    patch.title = String(body.title).trim() || "无标题";
  if (body.content !== undefined) patch.content = String(body.content);
  if (body.encrypted !== undefined) patch.encrypted = body.encrypted === true;
  if (body.visibility !== undefined)
    patch.visibility = body.visibility === "public" ? "public" : "private";
  if (body.folderId !== undefined)
    patch.folderId = body.folderId ? String(body.folderId) : null;

  const existing = await getNote(user.id, id);
  if (!existing) return jsonError("笔记不存在", 404);

  const encrypted = patch.encrypted ?? existing.encrypted;
  const visibility = patch.visibility ?? existing.visibility;
  if (encrypted && visibility === "public") {
    return jsonError("公开笔记无法加密，请先设为私有", 400);
  }

  const updated = await updateNote(user.id, id, patch);
  return Response.json({ note: updated as Note });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isCsrfOk(request)) return jsonError("请求无效", 400);
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const note = await getNote(user.id, id);
  if (!note) return jsonError("笔记不存在", 404);

  await deleteNote(user.id, id);
  return new Response(null, { status: 204 });
}
