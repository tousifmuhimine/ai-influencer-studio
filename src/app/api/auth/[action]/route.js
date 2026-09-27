import { NextResponse } from "next/server";
import { clearSession, getSession, setSession } from "@/lib/session";
import { supabaseAdminCreateUser, supabaseAuth, supabaseConfigured } from "@/lib/supabase";

export async function GET(_request, { params }) {
  const { action } = await params;
  if (action !== "session") return NextResponse.json({ error: "Unknown auth action" }, { status: 404 });
  const session = await getSession();
  return NextResponse.json({ authenticated: Boolean(session), user: session ? { email: session.email, companyName: session.companyName } : null });
}

export async function POST(request, { params }) {
  const { action } = await params;
  if (action === "logout") {
    await clearSession();
    return NextResponse.json({ ok: true });
  }

  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const companyName = String(body.companyName || "").trim();
  const password = String(body.password || "");
  if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  if (action === "signup" && !companyName) return NextResponse.json({ error: "Company name is required." }, { status: 400 });

  if (supabaseConfigured()) {
    try {
      if (action === "signup" && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const data = await supabaseAdminCreateUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { company_name: companyName }
        });
        await setSession({ email, companyName });
        return NextResponse.json({ ...data, user: { ...(data.user || {}), email, companyName }, emailConfirmed: true });
      }

      const path = action === "signup" ? "signup" : "token?grant_type=password";
      const payload = action === "signup" ? { email, password, data: { company_name: companyName } } : { email, password };
      const data = await supabaseAuth(path, payload);
      const metadataCompany = data.user?.user_metadata?.company_name || companyName;
      await setSession({ email, companyName: metadataCompany });
      return NextResponse.json({ ...data, user: { ...(data.user || {}), email, companyName: metadataCompany } });
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
  }

  const session = await setSession({ email, companyName });
  return NextResponse.json({
    user: { email, companyName },
    session,
    localAuth: true,
    message: "Signed in with local studio auth."
  });
}
