/**
 * Server-side session management. The cookie only ever holds an opaque
 * random token — the actual session (and its expiry) lives in the
 * `sessions` table, so revoking access is a single DELETE, not a JWT
 * blocklist. Server-only: never import this from client-rendered code.
 */
import { randomBytes } from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getDb } from "../../../db/connection";

const COOKIE_NAME = "session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  phone: string | null;
  roles: string[];
  mfaVerified: boolean;
};

export async function createSession(userId: string): Promise<void> {
  const sql = getDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${token}, ${userId}, ${expiresAt})`;

  // Expired rows are otherwise never removed — getSessionUser() filters them
  // out but leaves them in place, so the table would grow forever. Pruning
  // opportunistically on login (a rare operation) keeps it bounded without
  // pg_cron or a separate worker. Uses the expires_at index.
  if (Math.random() < 0.1) {
    try {
      await sql`DELETE FROM sessions WHERE expires_at < now()`;
    } catch {
      // Housekeeping must never turn a successful login into a failure.
    }
  }
  setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const token = getCookie(COOKIE_NAME);
  if (token) {
    const sql = getDb();
    await sql`DELETE FROM sessions WHERE id = ${token}`;
  }
  deleteCookie(COOKIE_NAME, { path: "/" });
}

/** Returns the logged-in user (with roles) for the current request, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;

  const sql = getDb();
  const rows = await sql<
    { id: string; email: string; phone: string | null; mfa_token_expires_at: Date | null; role: string | null }[]
  >`
    SELECT u.id, u.email, u.phone, u.mfa_token_expires_at, r.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN user_roles r ON r.user_id = u.id
    WHERE s.id = ${token} AND s.expires_at > now()
  `;
  if (!rows.length) return null;

  const roles = rows.map((r) => r.role).filter((r): r is string => !!r);
  const mfaVerified = !!rows[0].mfa_token_expires_at && rows[0].mfa_token_expires_at > new Date();
  return { id: rows[0].id, email: rows[0].email, phone: rows[0].phone, roles, mfaVerified };
}
