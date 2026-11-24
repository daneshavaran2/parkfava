/**
 * Server-side session management. The cookie only ever holds an opaque
 * random token — the actual session (and its expiry) lives in the
 * `sessions` table, so revoking access is a single DELETE, not a JWT
 * blocklist. Server-only: never import this from client-rendered code.
 */
import { createHash, randomBytes } from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getDb } from "../../../db/connection";

const COOKIE_NAME = "session";
const SESSION_DAYS = 30;
// Without "remember me" the session dies with the browser: the cookie gets no
// max-age (so it is discarded on close) and the row expires the next day, so a
// shared or public machine does not keep anyone signed in for a month.
const SHORT_SESSION_DAYS = 1;

export type SessionUser = {
  id: string;
  // Null for a company account that signs in with its national ID only
  // (db/migrations/0021); every account has at least one of the two.
  email: string | null;
  nationalId: string | null;
  phone: string | null;
  roles: string[];
  mfaVerified: boolean;
  mustChangePassword: boolean;
};

/**
 * The cookie carries a random token; the database keeps only its SHA-256, so
 * someone who can read the sessions table (a backup, a dump, a read-only DB
 * user) cannot use what they see to sign in as anyone (docs/Security
 * Report.md, SEC-027). Migration 0023 hashed the sessions that existed before.
 */
function sessionKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, remember = true): Promise<void> {
  const sql = getDb();
  const token = randomBytes(32).toString("hex");
  const days = remember ? SESSION_DAYS : SHORT_SESSION_DAYS;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${sessionKey(token)}, ${userId}, ${expiresAt})`;

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
    ...(remember ? { maxAge: days * 24 * 60 * 60 } : {}),
  });
}

export async function destroySession(): Promise<void> {
  const token = getCookie(COOKIE_NAME);
  if (token) {
    const sql = getDb();
    await sql`DELETE FROM sessions WHERE id = ${sessionKey(token)}`;
  }
  deleteCookie(COOKIE_NAME, { path: "/" });
}

/** Marks the session making this request as MFA-verified until `until`. */
export async function markSessionMfaVerified(userId: string, until: Date): Promise<void> {
  const token = getCookie(COOKIE_NAME);
  if (!token) throw new Error("Unauthorized: not signed in");
  const sql = getDb();
  await sql`UPDATE sessions SET mfa_verified_until = ${until} WHERE id = ${sessionKey(token)} AND user_id = ${userId}`;
}

/** Ends every session of `userId` except the one making this request. */
export async function destroyOtherSessions(userId: string): Promise<void> {
  const token = getCookie(COOKIE_NAME) ?? "";
  const sql = getDb();
  await sql`DELETE FROM sessions WHERE user_id = ${userId} AND id <> ${sessionKey(token)}`;
}

/** Returns the logged-in user (with roles) for the current request, or null. */
/**
 * True when a raw Cookie header carries a session token that is live in the
 * database. For src/server.ts, which runs before the framework's request
 * context exists (so getCookie() is not available there). Fails closed: if the
 * lookup fails the caller is treated as anonymous.
 */
export async function isLiveSessionCookie(cookieHeader: string | null): Promise<boolean> {
  const raw = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!raw) return false;
  try {
    const token = decodeURIComponent(raw);
    const rows =
      await getDb()`SELECT 1 FROM sessions WHERE id = ${sessionKey(token)} AND expires_at > now()`;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;

  const sql = getDb();
  const rows = await sql<
    {
      id: string;
      email: string | null;
      national_id: string | null;
      phone: string | null;
      mfa_verified_until: Date | null;
      must_change_password: boolean;
      role: string | null;
    }[]
  >`
    SELECT u.id, u.email, u.national_id, u.phone, s.mfa_verified_until, u.must_change_password, r.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN user_roles r ON r.user_id = u.id
    WHERE s.id = ${sessionKey(token)} AND s.expires_at > now()
  `;
  if (!rows.length) return null;

  const roles = rows.map((r) => r.role).filter((r): r is string => !!r);
  // Per session: see db/migrations/0022_sessions_mfa_verified.sql.
  const mfaVerified = !!rows[0].mfa_verified_until && rows[0].mfa_verified_until > new Date();
  return {
    id: rows[0].id,
    email: rows[0].email,
    nationalId: rows[0].national_id,
    phone: rows[0].phone,
    roles,
    mfaVerified,
    mustChangePassword: rows[0].must_change_password,
  };
}
