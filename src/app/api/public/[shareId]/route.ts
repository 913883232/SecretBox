import { getPublicNoteByShareId } from "@/lib/store/data";
import type { PublicNote } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Public, unauthenticated read of a shared note. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  const note = await getPublicNoteByShareId(shareId);
  if (!note)
    return Response.json(
      { error: "笔记不存在或已被设为私有" },
      { status: 404 }
    );

  const data: PublicNote = {
    title: note.title,
    content: note.content,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
  return Response.json({ note: data });
}
