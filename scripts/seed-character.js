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

const identity = {
  faceCut: "Consistent oval heart face cut, softly tapered jaw, balanced cheekbones, natural Bangladeshi complexion.",
  anchorPrompt: "Preserve Ayra's same facial structure, face cut, proportions, and identity across every output.",
  referenceImages: [],
  identityLockStrength: 0.75,
  negativeIdentityPrompt: "different person, changed face shape, altered jawline, inconsistent identity",
  notes: "Add approved face references here. Models do not guarantee identity, but every job will reuse this identity pack."
};

const preferences = {
  portrait: [],
  "full-body": [],
  fashion: [],
  lifestyle: [],
  restaurant: [],
  travel: [],
  "image editing": [],
  "image-to-video": [],
  "cinematic video": [],
  "social media video": []
};

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  await client.query(
    `insert into public.studio_characters (id, name, identity, preferences, updated_at)
     values ($1, $2, $3::jsonb, $4::jsonb, now())
     on conflict (id) do update
     set name = excluded.name,
         identity = excluded.identity,
         preferences = excluded.preferences,
         updated_at = now()`,
    ["ayra", "Ayra", JSON.stringify(identity), JSON.stringify(preferences)]
  );
  console.log("Ayra identity profile seeded in Supabase.");
} finally {
  await client.end().catch(() => {});
}
