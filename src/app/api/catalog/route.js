import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { hydratedCatalog, loadDb, providerStatuses } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const db = await loadDb();
  const providers = await providerStatuses(db);
  return NextResponse.json({
    providers,
    models: hydratedCatalog(db, providers),
    characters: db.characters,
    auth: { supabaseConfigured: supabaseConfigured() }
  });
}
