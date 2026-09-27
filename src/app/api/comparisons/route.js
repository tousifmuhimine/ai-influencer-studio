import { NextResponse } from "next/server";
import { enqueueComparison } from "@/lib/generation-service";
import { getSession } from "@/lib/session";

export async function POST(request) {
  if (!(await getSession())) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const body = await request.json();
  const jobs = await enqueueComparison(body);
  return NextResponse.json({ jobs }, { status: 202 });
}
