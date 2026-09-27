import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { defaultDb } from "./default-db";
import { PROVIDERS } from "./providers";
import { registry } from "./model-registry";
import { getSession } from "./session";
import { loadWorkspace, saveWorkspace } from "./supabase";

const dataDir = join(process.cwd(), ".studio-data");
const dbPath = join(dataDir, "db.json");

export async function loadDb(ownerEmail) {
  const session = ownerEmail ? null : await getSession();
  const email = ownerEmail || session?.email;
  if (email) {
    try {
      const workspace = await loadWorkspace(email);
      if (workspace) return normalizeDb({ ...defaultDb, ...workspace });
    } catch {
      // Fall back to local storage when Supabase persistence is unavailable.
    }
  }
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dbPath)) await writeFile(dbPath, JSON.stringify(defaultDb, null, 2));
  return normalizeDb({ ...defaultDb, ...JSON.parse(await readFile(dbPath, "utf8")) });
}

export async function saveDb(db, ownerEmail) {
  const session = ownerEmail ? null : await getSession();
  const email = ownerEmail || session?.email;
  if (email) {
    try {
      await saveWorkspace(email, db);
      return;
    } catch {
      // Fall back to local storage when Supabase persistence is unavailable.
    }
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

function normalizeDb(db) {
  const fallback = defaultDb.characters[0];
  db.characters = (db.characters || []).map((character) => ({
    ...fallback,
    ...character,
    identity: { ...fallback.identity, ...(character.identity || {}) },
    preferences: { ...fallback.preferences, ...(character.preferences || {}) }
  }));
  db.characters = db.characters.map((character) => {
    if (character.id !== "ayra" || !character.identity.faceCut.includes("Consistent oval heart face cut")) return character;
    return { ...character, identity: { ...character.identity, ...fallback.identity, referenceImages: character.identity.referenceImages || [] } };
  });
  return db;
}

function key() {
  if (process.env.NODE_ENV === "production" && !process.env.APP_SECRET) {
    throw new Error("APP_SECRET must be configured in production.");
  }
  return createHash("sha256").update(process.env.APP_SECRET || "local-dev-ai-influencer-studio").digest();
}

export function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), data: encrypted.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decrypt(payload) {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]).toString("utf8");
}

export async function getCredential(providerId, db) {
  const saved = db.credentials[providerId];
  if (saved?.encrypted && saved.enabled !== false) return decrypt(saved.encrypted);
  const envName = PROVIDERS[providerId]?.env;
  return envName ? process.env[envName] : "";
}

function maskSecret(secret) {
  if (!secret) return "";
  if (secret.length <= 8) return "****";
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

export async function providerStatuses(db) {
  const entries = await Promise.all(Object.entries(PROVIDERS).map(async ([id, provider]) => {
    const saved = db.credentials[id];
    const secret = await getCredential(id, db);
    return [id, {
      id,
      name: provider.name,
      env: provider.env,
      implemented: provider.implemented,
      connected: Boolean(secret),
      enabled: saved?.enabled !== false,
      source: saved?.encrypted ? "encrypted database credential" : (process.env[provider.env] ? "environment variable" : "unavailable"),
      masked: maskSecret(secret)
    }];
  }));
  return Object.fromEntries(entries);
}

export function hydratedCatalog(db, statuses) {
  return [...registry, ...(db.customModels || [])].map((model) => ({
    ...model,
    favorite: db.favoriteModels.includes(model.id),
    providerName: PROVIDERS[model.provider]?.name || model.provider,
    providerConfigured: Boolean(statuses[model.provider]?.connected),
    providerImplemented: Boolean(statuses[model.provider]?.implemented)
  })).sort((a, b) => {
    const pricing = Number(a.pricing !== "free_self_hosted") - Number(b.pricing !== "free_self_hosted");
    return pricing || Number(b.preferred) - Number(a.preferred) || Number(b.favorite) - Number(a.favorite) || a.providerName.localeCompare(b.providerName) || a.displayName.localeCompare(b.displayName);
  });
}

export function withIdentityPack(db, input = {}) {
  const identity = db.characters.find((character) => character.id === input.character)?.identity || {};
  const referenceImages = [...(identity.referenceImages || []), ...(input.referenceImages || [])].filter(Boolean);
  const prompt = [
    identity.anchorPrompt,
    identity.faceCut ? `Identity face cut: ${identity.faceCut}` : "",
    input.prompt
  ].filter(Boolean).join("\n\n");
  const negativePrompt = [input.negativePrompt, identity.negativeIdentityPrompt].filter(Boolean).join(", ");
  return {
    ...input,
    prompt,
    negativePrompt,
    referenceImages,
    identityPack: {
      faceCut: identity.faceCut || "",
      anchorPrompt: identity.anchorPrompt || "",
      referenceImages: identity.referenceImages || [],
      identityLockStrength: identity.identityLockStrength ?? null,
      notes: identity.notes || ""
    }
  };
}
