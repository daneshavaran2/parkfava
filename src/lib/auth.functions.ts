/**
 * Self-hosted replacement for Supabase Auth's signUp/signInWithPassword/
 * signOut. Email/password only for now — Google OAuth is deliberately out
 * of scope for this phase (per user decision) and can be layered on later
 * without touching this shape.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../../db/connection";
import { hashPassword, verifyPassword } from "./auth/password.server";
import { createSession, destroySession, getSessionUser } from "./auth/session.server";
import { requireAuth } from "./auth/middleware";
import { clientKey, enforceRateLimit } from "./rate-limit.server";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  // Absent means "remember me", which is what every caller predating the
  // login-page checkbox expected.
  remember: z.boolean().optional(),
});

/**
 * Throttles for the credential endpoints.
 *
 * Two buckets per attempt. The per-account one is what actually stops a
 * password being guessed, and it has to be keyed on the email rather than the
 * caller: an attacker with a botnet gets a fresh IP per request, and behind
 * Liara's proxy several honest users can share one. The per-caller one then
 * covers what the first misses — spraying one password across many accounts,
 * which never trips a single account's counter.
 *
 * Limits are set so a person who genuinely forgot their password does not get
 * locked out mid-attempt, while an automated guesser drops from thousands of
 * tries an hour to a handful.
 */
const LOGIN_LIMITS = {
  perAccount: { limit: 8, windowSeconds: 300 },
  // Deliberately looser than the per-account limit: a whole park's staff can
  // share one egress IP, and locking them out collectively would be a worse
  // failure than the spraying this is meant to slow down. Still cuts the
  // measured 6 attempts/second to roughly four a minute.
  perClient: { limit: 60, windowSeconds: 900 },
  signupPerClient: { limit: 5, windowSeconds: 3600 },
} as const;

export const signUp = createServerFn({ method: "POST" })
  .inputValidator((i) => credentialsSchema.parse(i))
  .handler(async ({ data }) => {
    const sql = getDb();
    const email = data.email.trim().toLowerCase();
    // Before the password hash: scrypt is deliberately expensive, so letting
    // an unthrottled caller reach it is itself the denial-of-service.
    await enforceRateLimit(`signup:${clientKey()}`, LOGIN_LIMITS.signupPerClient);

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length) throw new Error("EMAIL_ALREADY_REGISTERED");

    const password_hash = await hashPassword(data.password);
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, ${password_hash})
      RETURNING id
    `;
    await createSession(user.id, data.remember ?? true);
    return { ok: true };
  });

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((i) => credentialsSchema.parse(i))
  .handler(async ({ data }) => {
    const sql = getDb();
    const email = data.email.trim().toLowerCase();

    // Counted before the lookup, so an attempt against an address that has no
    // account still consumes allowance. Checking only real accounts would let
    // the throttle itself confirm which addresses are registered.
    await enforceRateLimit(`signin:${email}`, LOGIN_LIMITS.perAccount);
    await enforceRateLimit(`signin-ip:${clientKey()}`, LOGIN_LIMITS.perClient);

    const rows = await sql<{ id: string; password_hash: string }[]>`
      SELECT id, password_hash FROM users WHERE email = ${email}
    `;
    // Same error for "no such user" and "wrong password" — don't leak
    // which one it was.
    const invalid = () => new Error("INVALID_CREDENTIALS");
    if (!rows.length) throw invalid();
    const ok = await verifyPassword(data.password, rows[0].password_hash);
    if (!ok) throw invalid();

    // A correct password clears the account's counter, so a user who fumbles
    // a few times and then succeeds is not left throttled — only a run of
    // failures keeps the limit in force.
    await sql`DELETE FROM rate_limit_hits WHERE bucket = ${`signin:${email}`}`;

    await createSession(rows[0].id, data.remember ?? true);
    return { ok: true };
  });

export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  await destroySession();
  return { ok: true };
});

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  return await getSessionUser();
});

// Simple authenticated ping — mirrors requireSupabaseAuth-gated handlers
// elsewhere, useful for verifying the middleware chain end-to-end.
export const whoAmI = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => context.user);
