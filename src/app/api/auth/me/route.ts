import { currentUser } from "@/lib/server-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  return Response.json({ user });
}
