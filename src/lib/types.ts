export type NoteVisibility = "private" | "public";

export interface UserPublic {
  id: string;
  email: string;
}

export interface KeyEnvelope {
  salt: string;
  wrappedKey: string;
}

export interface Folder {
  id: string;
  userId: string;
  parentId: string | null;
  name: string;
  createdAt: string;
}

export interface Note {
  id: string;
  userId: string;
  folderId: string | null;
  title: string;
  /** Plaintext for normal notes; base64(iv+ciphertext) for encrypted notes. */
  content: string;
  encrypted: boolean;
  visibility: NoteVisibility;
  shareId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicNote {
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
