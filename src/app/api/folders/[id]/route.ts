import { deleteFolder, getFolder, updateFolder } from "@/lib/store/data";
import {
  currentUser,
  isCsrfOk,
  jsonError,
  readJson,
  unauthorized,
} from "@/lib/server-utils";
import type { Folder } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isCsrfOk(request)) return jsonError("请求无效", 400);
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await readJson<{ name?: unknown }>(request);
  if (!body) return jsonError("请求格式错误", 400);

  const name = String(body.name ?? "").trim();
  if (!name) return jsonError("文件夹名称不能为空", 400);

  const updated = await updateFolder(user.id, id, name);
  if (!updated) return jsonError("文件夹不存在", 404);
  return Response.json({ folder: updated as Folder });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isCsrfOk(request)) return jsonError("请求无效", 400);
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const folder = await getFolder(user.id, id);
  if (!folder) return jsonError("文件夹不存在", 404);

  await deleteFolder(user.id, id);
  return new Response(null, { status: 204 });
}
