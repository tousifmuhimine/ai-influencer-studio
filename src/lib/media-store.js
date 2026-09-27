import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

const mediaDir = join(process.cwd(), ".studio-data", "media");
const supportedTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"]
]);

export async function persistMediaDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/.exec(dataUrl || "");
  if (!match) return dataUrl;
  const [, mimeType, base64] = match;
  const extension = supportedTypes.get(mimeType);
  if (!extension) throw new Error("Unsupported image format.");
  const id = `${randomBytes(12).toString("hex")}.${extension}`;
  await mkdir(mediaDir, { recursive: true });
  await writeFile(join(mediaDir, id), Buffer.from(base64, "base64"));
  return `/api/media/${id}`;
}

export async function mediaAsBlob(reference) {
  const id = reference?.replace("/api/media/", "");
  if (!id || id === reference || !/^[a-f0-9]{24}\.(png|jpg|webp)$/.test(id)) return null;
  const extension = id.split(".").pop();
  const mimeType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
  return new Blob([await readFile(join(mediaDir, id))], { type: mimeType });
}

export async function readMedia(id) {
  if (!/^[a-f0-9]{24}\.(png|jpg|webp)$/.test(id || "")) return null;
  const extension = id.split(".").pop();
  const mimeType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
  try {
    return { data: await readFile(join(mediaDir, id)), mimeType };
  } catch {
    return null;
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
