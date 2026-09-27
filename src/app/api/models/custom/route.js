import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadDb, saveDb } from "@/lib/store";

export async function POST(request) {
  if (!(await getSession())) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const db = await loadDb();
  const body = await request.json();
  const custom = {
    ...body,
    id: `custom:${body.provider}:${body.modelId}`.replace(/\s+/g, "-"),
    custom: true,
    availability: body.availability || "available",
    capabilities: body.capabilities || [],
    supportedInputs: body.supportedInputs || [],
    supportedOutputs: body.supportedOutputs || [],
    resolutions: body.resolutions || [],
    aspectRatios: body.aspectRatios || []
  };
  db.customModels = db.customModels.filter((model) => model.id !== custom.id);
  db.customModels.push(custom);
  await saveDb(db);
  return NextResponse.json({ model: custom }, { status: 201 });
}
