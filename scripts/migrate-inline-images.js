import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

const dataDir = join(process.cwd(), ".studio-data");
const mediaDir = join(dataDir, "media");
const dbPath = join(dataDir, "db.json");
const db = JSON.parse(await readFile(dbPath, "utf8"));

async function persistMediaDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/.exec(dataUrl || "");
  if (!match) return dataUrl;
  const [, mimeType, base64] = match;
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
  const id = `${randomBytes(12).toString("hex")}.${extension}`;
  await mkdir(mediaDir, { recursive: true });
  await writeFile(join(mediaDir, id), Buffer.from(base64, "base64"));
  return `/api/media/${id}`;
}

async function persistOutputImages(output) {
  if (!output?.data || !Array.isArray(output.data)) return output;
  return {
    ...output,
    data: await Promise.all(output.data.map(async (item) => {
      if (!item?.b64_json) return item;
      const url = await persistMediaDataUrl(`data:${item.content_type || "image/png"};base64,${item.b64_json}`);
      const { b64_json, ...rest } = item;
      return { ...rest, url };
    }))
  };
}
for (const character of db.characters || []) {
  character.identity.referenceImages = await Promise.all((character.identity.referenceImages || []).map(persistMediaDataUrl));
}
for (const job of db.jobs || []) job.output = await persistOutputImages(job.output);
for (const job of db.jobs || []) {
  if (job.input?.referenceImages) job.input.referenceImages = await Promise.all(job.input.referenceImages.map(persistMediaDataUrl));
  if (job.input?.identityPack?.referenceImages) job.input.identityPack.referenceImages = await Promise.all(job.input.identityPack.referenceImages.map(persistMediaDataUrl));
}
for (const generation of db.generations || []) {
  generation.referenceImages = await Promise.all((generation.referenceImages || []).map(persistMediaDataUrl));
  if (generation.parameters?.referenceImages) generation.parameters.referenceImages = await Promise.all(generation.parameters.referenceImages.map(persistMediaDataUrl));
  if (generation.parameters?.identityPack?.referenceImages) generation.parameters.identityPack.referenceImages = await Promise.all(generation.parameters.identityPack.referenceImages.map(persistMediaDataUrl));
  generation.output = await persistOutputImages(generation.output);
}
await writeFile(dbPath, JSON.stringify(db, null, 2));
