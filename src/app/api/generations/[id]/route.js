import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadDb, saveDb } from "@/lib/store";

export async function PATCH(request, { params }) {
  if (!(await getSession())) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const { id } = await params;
  const db = await loadDb();
  const body = await request.json();
  const generation = db.generations.find((item) => item.id === id);
  if (!generation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  Object.assign(generation, body);
  await saveDb(db);
  return NextResponse.json({ generation });
}
