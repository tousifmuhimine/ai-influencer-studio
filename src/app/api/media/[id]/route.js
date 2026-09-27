import { getSession } from "@/lib/session";
import { readMedia } from "@/lib/media-store";

export async function GET(request, { params }) {
  if (!(await getSession())) return new Response("Login required.", { status: 401 });
  const { id } = await params;
  const media = await readMedia(id);
  if (!media) return new Response("Not found.", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const headers = { "content-type": media.mimeType, "cache-control": "private, max-age=86400" };
  if (download) headers["content-disposition"] = `attachment; filename="${id}"`;
  return new Response(media.data, { headers });
}
