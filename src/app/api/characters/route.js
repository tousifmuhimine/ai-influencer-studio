import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { defaultDb } from "@/lib/default-db";
import { persistMediaDataUrl } from "@/lib/media-store";
import { getSession } from "@/lib/session";
import { loadDb, saveDb } from "@/lib/store";
import { mirrorCharacterToSupabase } from "@/lib/supabase";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const db = await loadDb();
  return NextResponse.json({ characters: db.characters });
}

export async function POST(request) {
  if (!(await getSession())) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const db = await loadDb();
  const body = await request.json();
  if (body.identity?.referenceImages) body.identity.referenceImages = await Promise.all(body.identity.referenceImages.map(persistMediaDataUrl));
  const id = (body.id || body.name || `character_${randomBytes(4).toString("hex")}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const existing = db.characters.find((character) => character.id === id);
  const character = {
    ...(existing || {}),
    id,
    name: body.name || existing?.name || id,
    identity: { ...(existing?.identity || defaultDb.characters[0].identity), ...(body.identity || {}) },
    preferences: { ...(existing?.preferences || defaultDb.characters[0].preferences), ...(body.preferences || {}) }
  };
  db.characters = db.characters.filter((item) => item.id !== id);
  db.characters.push(character);
  await saveDb(db);
  const supabase = await mirrorCharacterToSupabase(character);
  return NextResponse.json({ character, supabase });
}
