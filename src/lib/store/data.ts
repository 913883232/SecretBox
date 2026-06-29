import "server-only";
import { store } from "./index";
import type {
  Folder,
  KeyEnvelope,
  Note,
  NoteVisibility,
} from "@/lib/types";

/**
 * Key schema (flat, prefix-listable — matches how EdgeOne KV works):
 *   u:email:<email>   -> { id }
 *   u:<id>            -> UserRecord
 *   k:<userId>        -> KeyEnvelope
 *   f:<userId>:<fid>  -> Folder
 *   n:<userId>:<nid>  -> Note
 *   s:<shareId>       -> { userId, noteId }   (public share index)
 */

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

function uuid(): string {
  return crypto.randomUUID();
}
function now(): string {
  return new Date().toISOString();
}

// ---- Users -------------------------------------------------------------
export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const ref = await store.get<{ id: string }>(`u:email:${email}`);
  if (!ref) return null;
  return getUserById(ref.id);
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  return store.get<UserRecord>(`u:${id}`);
}

export async function createUser(
  email: string,
  passwordHash: string
): Promise<UserRecord> {
  const record: UserRecord = {
    id: uuid(),
    email,
    passwordHash,
    createdAt: now(),
  };
  await store.put(`u:${record.id}`, record);
  await store.put(`u:email:${email}`, { id: record.id });
  return record;
}

// ---- Encryption keys ---------------------------------------------------
export async function getUserKey(userId: string): Promise<KeyEnvelope | null> {
  return store.get<KeyEnvelope>(`k:${userId}`);
}

export async function saveUserKey(
  userId: string,
  envelope: KeyEnvelope
): Promise<void> {
  await store.put(`k:${userId}`, envelope);
}

// ---- Folders -----------------------------------------------------------
export async function listFolders(userId: string): Promise<Folder[]> {
  const keys = await store.listKeys(`f:${userId}:`);
  const folders = await Promise.all(
    keys.map((k) => store.get<Folder>(k))
  );
  return folders.filter((f): f is Folder => f !== null);
}

export async function getFolder(
  userId: string,
  folderId: string
): Promise<Folder | null> {
  const folder = await store.get<Folder>(`f:${userId}:${folderId}`);
  if (!folder || folder.userId !== userId) return null;
  return folder;
}

export async function createFolder(
  userId: string,
  name: string,
  parentId: string | null
): Promise<Folder> {
  const folder: Folder = {
    id: uuid(),
    userId,
    parentId,
    name,
    createdAt: now(),
  };
  await store.put(`f:${userId}:${folder.id}`, folder);
  return folder;
}

export async function updateFolder(
  userId: string,
  folderId: string,
  name: string
): Promise<Folder | null> {
  const existing = await getFolder(userId, folderId);
  if (!existing) return null;
  const updated: Folder = { ...existing, name };
  await store.put(`f:${userId}:${folderId}`, updated);
  return updated;
}

export async function deleteFolder(userId: string, folderId: string): Promise<void> {
  // Notes inside move to "unfiled" (folderId = null).
  const notes = await listNotes(userId);
  await Promise.all(
    notes
      .filter((n) => n.folderId === folderId)
      .map((n) => updateNote(userId, n.id, { folderId: null }))
  );
  await store.delete(`f:${userId}:${folderId}`);
}

// ---- Notes -------------------------------------------------------------
export async function listNotes(userId: string): Promise<Note[]> {
  const keys = await store.listKeys(`n:${userId}:`);
  const notes = await Promise.all(keys.map((k) => store.get<Note>(k)));
  return notes.filter((n): n is Note => n !== null);
}

export async function getNote(
  userId: string,
  noteId: string
): Promise<Note | null> {
  const note = await store.get<Note>(`n:${userId}:${noteId}`);
  if (!note || note.userId !== userId) return null;
  return note;
}

/** Keep the public-share index in sync with a note's visibility/shareId. */
async function reconcileShare(note: Note): Promise<void> {
  if (note.visibility === "public" && note.shareId) {
    await store.put(`s:${note.shareId}`, {
      userId: note.userId,
      noteId: note.id,
    });
  }
  if (note.visibility !== "public" && note.shareId) {
    await store.delete(`s:${note.shareId}`);
  }
}

export interface NoteInput {
  title: string;
  content: string;
  encrypted: boolean;
  visibility: NoteVisibility;
  folderId: string | null;
}

export async function createNote(
  userId: string,
  input: NoteInput
): Promise<Note> {
  const shareId =
    input.visibility === "public" ? makeShareId() : null;
  const note: Note = {
    id: uuid(),
    userId,
    folderId: input.folderId,
    title: input.title,
    content: input.content,
    encrypted: input.encrypted,
    visibility: input.visibility,
    shareId,
    createdAt: now(),
    updatedAt: now(),
  };
  await store.put(`n:${userId}:${note.id}`, note);
  await reconcileShare(note);
  return note;
}

export async function updateNote(
  userId: string,
  noteId: string,
  patch: Partial<NoteInput>
): Promise<Note | null> {
  const existing = await getNote(userId, noteId);
  if (!existing) return null;

  const updated: Note = {
    ...existing,
    ...("title" in patch && patch.title !== undefined
      ? { title: patch.title }
      : {}),
    ...("content" in patch && patch.content !== undefined
      ? { content: patch.content }
      : {}),
    ...("encrypted" in patch && patch.encrypted !== undefined
      ? { encrypted: patch.encrypted }
      : {}),
    ...("visibility" in patch && patch.visibility !== undefined
      ? {
          visibility: patch.visibility,
          shareId:
            patch.visibility === "public"
              ? existing.shareId ?? makeShareId()
              : existing.shareId,
        }
      : {}),
    ...("folderId" in patch && patch.folderId !== undefined
      ? { folderId: patch.folderId }
      : {}),
    updatedAt: now(),
  };
  await store.put(`n:${userId}:${noteId}`, updated);
  await reconcileShare(updated);
  return updated;
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  const note = await getNote(userId, noteId);
  if (note?.shareId) await store.delete(`s:${note.shareId}`);
  await store.delete(`n:${userId}:${noteId}`);
}

// ---- Public share reads (unauthenticated) -----------------------------
export async function getPublicNoteByShareId(
  shareId: string
): Promise<Note | null> {
  const ref = await store.get<{ userId: string; noteId: string }>(`s:${shareId}`);
  if (!ref) return null;
  const note = await store.get<Note>(`n:${ref.userId}:${ref.noteId}`);
  if (!note || note.visibility !== "public") return null;
  return note;
}

function makeShareId(): string {
  // 12 url-safe chars of randomness.
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
