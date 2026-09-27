import { NextResponse } from "next/server";
import { PROVIDERS } from "@/lib/providers";
import { getSession } from "@/lib/session";
import { getCredential, loadDb, providerStatuses, saveDb } from "@/lib/store";

export async function GET(_request, { params }) {
  if (!(await getSession())) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const { provider } = await params;
  if (!PROVIDERS[provider]) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  const db = await loadDb();
  const apiKey = await getCredential(provider, db);
  return NextResponse.json({ apiKey }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(_request, { params }) {
  if (!(await getSession())) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const { provider } = await params;
  if (!PROVIDERS[provider]) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  const db = await loadDb();
  delete db.credentials[provider];
  await saveDb(db);
  return NextResponse.json({ providers: await providerStatuses(db) });
}
