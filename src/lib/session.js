import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "ai_identity_studio_session";
const maxAge = 60 * 60 * 24 * 14;

function secret() {
  if (process.env.NODE_ENV === "production" && !process.env.APP_SECRET) {
    throw new Error("APP_SECRET must be configured in production.");
  }
  return process.env.APP_SECRET || "local-dev-ai-identity-studio";
}

function sign(value) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function encodeSession(session) {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(value) {
  if (!value || !value.includes(".")) return null;
  const [payload, signature] = value.split(".");
  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
  const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!session?.email || !session?.expiresAt || Date.now() > session.expiresAt) return null;
  return session;
}

export async function getSession() {
  const cookieStore = await cookies();
  try {
    return decodeSession(cookieStore.get(cookieName)?.value);
  } catch {
    return null;
  }
}

export async function setSession(user) {
  const cookieStore = await cookies();
  const session = {
    email: typeof user === "string" ? user : user.email,
    companyName: typeof user === "string" ? "" : user.companyName || "",
    expiresAt: Date.now() + maxAge * 1000
  };
  cookieStore.set(cookieName, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge
  });
  return session;
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}
