import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { uploadMediaFile } from "../src/lib/media-store.js";

const root = resolve(".");
const envPath = join(root, ".env");
const dbPath = join(root, ".studio-data", "db.json");

if (existsSync(envPath)) {
  for (const line of (await readFile(envPath, "utf8")).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const name = trimmed.slice(0, index).trim();
    if (!(name in process.env)) process.env[name] = trimmed.slice(index + 1).trim();
  }
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase service credentials are missing.");
if (!existsSync(dbPath)) throw new Error(".studio-data/db.json was not found.");

const db = JSON.parse(await readFile(dbPath, "utf8"));
const references = new Set();
function collect(value) {
  if (typeof value === "string") {
    const match = /\/api\/media\/([a-f0-9]{24}\.(png|jpg|webp))/.exec(value);
    if (match) references.add(match[1]);
  } else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === "object") Object.values(value).forEach(collect);
}
collect(db);

for (const id of references) {
  const extension = id.split(".").pop();
  const mimeType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
  const data = await readFile(join(root, ".studio-data", "media", id));
  await uploadMediaFile(id, data, mimeType);
  console.log(`Uploaded ${id}`);
}
console.log(`Migrated ${references.size} media file(s) to Supabase Storage.`);