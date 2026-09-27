import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadDb, saveDb } from "@/lib/store";

export async function POST(request) {
  if (!(await getSession())) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const db = await loadDb();
  const body = await request.json();
  db.favoriteModels = body.favorite
    ? [...new Set([...db.favoriteModels, body.modelId])]
    : db.favoriteModels.filter((id) => id !== body.modelId);
  await saveDb(db);
  return NextResponse.json({ favoriteModels: db.favoriteModels });
}
