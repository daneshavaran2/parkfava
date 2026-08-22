import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { getDb } from "../../db/connection";

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const SALT = "parkfava-assistant-settings-v1";

function encryptionKey() {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.DATABASE_URL;
  if (!secret) throw new Error("SETTINGS_ENCRYPTION_KEY_OR_DATABASE_URL_REQUIRED");
  return scryptSync(secret, SALT, 32);
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decryptSecret(payload: string) {
  const [version, ivRaw, tagRaw, ciphertextRaw] = payload.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !ciphertextRaw) throw new Error("INVALID_ENCRYPTED_SECRET");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

type AssistantSettingsRow = {
  api_key_encrypted: string | null;
  api_key_last_four: string | null;
  model: string;
  is_enabled: boolean;
  updated_at: Date;
};

export async function getAssistantRuntimeConfig() {
  try {
    const sql = getDb();
    const [row] = await sql<AssistantSettingsRow[]>`
      SELECT api_key_encrypted, api_key_last_four, model, is_enabled, updated_at
      FROM assistant_settings WHERE id = true
    `;
    if (row?.is_enabled && row.api_key_encrypted) {
      return { apiKey: decryptSecret(row.api_key_encrypted), model: row.model || DEFAULT_MODEL, source: "database" as const };
    }
  } catch (error) {
    console.error("[assistant-settings] Could not load database configuration", error);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey) return {
    apiKey,
    model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    source: "environment" as const,
  };
  return { apiKey: null, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL, source: "none" as const };
}

export async function getAssistantSettingsForAdmin() {
  const sql = getDb();
  const [row] = await sql<AssistantSettingsRow[]>`
    SELECT api_key_encrypted, api_key_last_four, model, is_enabled, updated_at
    FROM assistant_settings WHERE id = true
  `;
  return {
    configured: !!row?.api_key_encrypted || !!process.env.OPENROUTER_API_KEY,
    databaseConfigured: !!row?.api_key_encrypted,
    environmentConfigured: !!process.env.OPENROUTER_API_KEY,
    keyLastFour: row?.api_key_last_four ?? null,
    model: row?.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    enabled: row?.is_enabled ?? false,
    updatedAt: row?.updated_at ?? null,
  };
}
