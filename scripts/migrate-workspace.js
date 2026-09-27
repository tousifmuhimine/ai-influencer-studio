import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { saveWorkspace } from "../src/lib/supabase.js";

const email = String(process.argv[2] || "").trim().toLowerCase();
if (!email) throw new Error("Usage: node scripts/migrate-workspace.js email@example.com");

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
if (!existsSync(dbPath)) throw new Error(".studio-data/db.json was not found.");

await saveWorkspace(email, JSON.parse(await readFile(dbPath, "utf8")));
console.log(`Migrated local workspace to Supabase for ${email}.`);