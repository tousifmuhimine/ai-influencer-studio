import { NextResponse } from "next/server";
import { enqueueJob } from "@/lib/generation-service";
import { getSession } from "@/lib/session";
import { loadDb } from "@/lib/store";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const db = await loadDb();
  return NextResponse.json({ jobs: db.jobs, generations: db.generations });
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const body = await request.json();
  const job = await enqueueJob({ ...body, ownerEmail: session.email });
  return NextResponse.json({ job }, { status: 202 });
}
