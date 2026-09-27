import { NextResponse } from "next/server";
import { PROVIDERS } from "@/lib/providers";
import { getSession } from "@/lib/session";
import { encrypt, loadDb, providerStatuses, saveDb } from "@/lib/store";

export async function POST(request) {
  if (!(await getSession())) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const db = await loadDb();
  const body = await request.json();
  if (!PROVIDERS[body.provider]) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  db.credentials[body.provider] = {
    encrypted: body.apiKey ? encrypt(body.apiKey) : db.credentials[body.provider]?.encrypted,
    enabled: body.enabled !== false,
    updatedAt: new Date().toISOString()
  };
  await saveDb(db);
  return NextResponse.json({ providers: await providerStatuses(db) });
}
