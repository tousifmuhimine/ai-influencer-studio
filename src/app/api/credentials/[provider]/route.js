import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadDb, providerStatuses, saveDb } from "@/lib/store";

export async function DELETE(_request, { params }) {
  if (!(await getSession())) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const { provider } = await params;
  const db = await loadDb();
  delete db.credentials[provider];
  await saveDb(db);
  return NextResponse.json({ providers: await providerStatuses(db) });
}
