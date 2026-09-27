import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

const mediaDir = join(process.cwd(), ".studio-data", "media");
const storageBucket = "studio-media";
const supportedTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"]
]);

function storageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function storageRequest(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${storageBucket}/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Supabase Storage request failed with ${response.status}: ${await response.text()}`);
  return response;
}

export async function uploadMediaFile(id, data, mimeType) {
  if (!storageConfigured()) return false;
  await storageRequest(id, {
    method: "POST",
    headers: { "content-type": mimeType, "x-upsert": "true" },
    body: data
  });
  return true;
}

export async function persistMediaDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/.exec(dataUrl || "");
  if (!match) return dataUrl;
  const [, mimeType, base64] = match;
  const extension = supportedTypes.get(mimeType);
  if (!extension) throw new Error("Unsupported image format.");
  const id = `${randomBytes(12).toString("hex")}.${extension}`;
  const buffer = Buffer.from(base64, "base64");
  if (await uploadMediaFile(id, buffer, mimeType)) return `/api/media/${id}`;
  await mkdir(mediaDir, { recursive: true });
  await writeFile(join(mediaDir, id), buffer);
  return `/api/media/${id}`;
}

export async function mediaAsBlob(reference) {
  const id = reference?.replace("/api/media/", "");
  if (!id || id === reference || !/^[a-f0-9]{24}\.(png|jpg|webp)$/.test(id)) return null;
  const media = await readMedia(id);
  return media ? new Blob([media.data], { type: media.mimeType }) : null;
}

export async function readMedia(id) {
  if (!/^[a-f0-9]{24}\.(png|jpg|webp)$/.test(id || "")) return null;
  const extension = id.split(".").pop();
  const mimeType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
  try {
    return { data: await readFile(join(mediaDir, id)), mimeType };
  } catch {
    if (!storageConfigured()) return null;
    try {
      const response = await storageRequest(id);
      return { data: Buffer.from(await response.arrayBuffer()), mimeType };
    } catch {
      return null;
    }
  }
}

export async function persistOutputImages(output) {
  if (!output?.data || !Array.isArray(output.data)) return output;
  return {
    ...output,
    data: await Promise.all(output.data.map(async (item) => {
      if (!item?.b64_json) return item;
      const mimeType = item.content_type || "image/png";
      const url = await persistMediaDataUrl(`data:${mimeType};base64,${item.b64_json}`);
      const { b64_json, ...rest } = item;
      return { ...rest, url };
    }))
  };
}
