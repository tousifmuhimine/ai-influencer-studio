import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";

const root = resolve(".");
const envPath = join(root, ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const name = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(name in process.env)) process.env[name] = value;
  }
}

if (!process.env.SUPABASE_DATABASE_URL) {
  console.error("SUPABASE_DATABASE_URL is missing.");
  process.exit(1);
}

const sql = readFileSync(join(root, "supabase-schema.sql"), "utf8");
const client = new pg.Client({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  await client.query(sql);
  console.log("Supabase studio tables are ready.");
} finally {
  await client.end().catch(() => {});
}
