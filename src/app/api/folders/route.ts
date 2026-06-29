import {
  createFolder,
  listFolders,
} from "@/lib/store/data";
import {
  currentUser,
  isCsrfOk,
  jsonError,
  readJson,
  unauthorized,
} from "@/lib/server-utils";
import type { Folder } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const folders = await listFolders(user.id);
  return Response.json({ folders: folders as Folder[] });
}

interface CreateFolderBody {
  name?: unknown;
  parentId?: unknown;
}

export async function POST(request: Request) {
  if (!isCsrfOk(request)) return jsonError("请求无效", 400);
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = await readJson<CreateFolderBody>(request);
  if (!body) return jsonError("请求格式错误", 400);

  const name = String(body.name ?? "").trim();
  if (!name) return jsonError("文件夹名称不能为空", 400);
  if (name.length > 255) return jsonError("文件夹名称过长", 400);

  const parentId = body.parentId ? String(body.parentId) : null;
  const folder = await createFolder(user.id, name, parentId);
  return Response.json({ folder: folder as Folder });
}
