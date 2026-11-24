/**
 * Self-hosted replacement for Supabase Auth's signUp/signInWithPassword/
 * signOut. Sign-up is email/password; sign-in also accepts a company's
 * national ID as the username (src/lib/auth/login-id.ts). Google OAuth is
 * deliberately out of scope for this phase (per user decision) and can be
 * layered on later without touching this shape.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../../db/connection";
import { hashPassword, needsRehash, verifyPassword } from "./auth/password.server";
import { parseLoginId, toAsciiDigits } from "./auth/login-id";
import {
  createSession,
  destroyOtherSessions,
  destroySession,
  getSessionUser,
} from "./auth/session.server";
import { requireAuth } from "./auth/middleware";
import { assertStrongPassword } from "./auth/password-policy";
import { clientKey, enforceRateLimit, RateLimitError } from "./rate-limit.server";
import { logWarn } from "./log-envelope";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  // Absent means "remember me", which is what every caller predating the
  // login-page checkbox expected.
  remember: z.boolean().optional(),
});

// Sign-in takes a username that is either an email or a company national ID,
// so it cannot be validated as an email here — parseLoginId() classifies it.
// `email` is still accepted as the field name: pages loaded before the
// national-ID login shipped, and the authz test script, send it that way.
const signInSchema = z
  .object({
    identifier: z.string().min(1).max(254).optional(),
    email: z.string().min(1).max(254).optional(),
    password: z.string().min(1).max(256),
    remember: z.boolean().optional(),
  })
  .transform(({ identifier, email, ...rest }) => ({
    ...rest,
    identifier: identifier ?? email ?? "",
  }));

/**
 * Passwords are stored with Persian/Arabic-Indic digits folded to ASCII, so
 * the same numeric password matches whichever keyboard layout it is typed on
 * (companies' initial password is a mobile number). Applied when a password
 * is set; verifyLoginPassword() covers the other side.
 */
function canonicalPassword(password: string): string {
  return toAsciiDigits(password);
}

/**
 * Tries the password exactly as typed first — that is how every password set
 * before canonicalPassword() existed was stored — and only then its folded
 * form. The second scrypt runs only when the input actually contained
 * non-ASCII digits, so ordinary failed logins cost no more than before.
 */
async function verifyLoginPassword(password: string, stored: string): Promise<boolean> {
  if (await verifyPassword(password, stored)) return true;
  const folded = canonicalPassword(password);
  return folded !== password && (await verifyPassword(folded, stored));
}

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

/**
 * Applies a limit, but never lets the limiter's own failure block a login.
 *
 * A caller who is genuinely over the limit must still be refused — that is the
 * whole point. What must not happen is that `rate_limit_hits` being absent
 * (migration 0004 not yet applied to this database) or momentarily unreachable
 * turns every sign-in into a 500. The same reasoning already governs the
 * session prune in session.server.ts, which is wrapped so "housekeeping must
 * never turn a successful login into a failure", and the MFA check in auth.tsx,
 * which fails open rather than risk locking everyone out.
 *
 * The degraded state is logged rather than silent, so a throttle that has
 * quietly stopped throttling is visible instead of being assumed to work.
 */
async function applyLimit(
  bucket: string,
  limits: { limit: number; windowSeconds: number },
): Promise<void> {
  try {
    await enforceRateLimit(bucket, limits);
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
    logWarn({
      event: "rate_limit_unavailable",
      message: "Credential throttle skipped — the rate limiter failed",
      meta: { bucket, error: e instanceof Error ? e.message : String(e) },
    });
  }
}

export const signUp = createServerFn({ method: "POST" })
  .validator((i) => credentialsSchema.parse(i))
  .handler(async ({ data }) => {
    const sql = getDb();
    const email = data.email.trim().toLowerCase();
    // Before the password hash: scrypt is deliberately expensive, so letting
    // an unthrottled caller reach it is itself the denial-of-service.
    await applyLimit(`signup:${clientKey()}`, LOGIN_LIMITS.signupPerClient);
    assertStrongPassword(data.password, [email]);

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length) throw new Error("EMAIL_ALREADY_REGISTERED");

    const password_hash = await hashPassword(canonicalPassword(data.password));
    let user: { id: string };
    try {
      [user] = await sql<{ id: string }[]>`
        INSERT INTO users (email, password_hash) VALUES (${email}, ${password_hash})
        RETURNING id
      `;
    } catch (e) {
      // Two sign-ups for the same email at once: the second loses the race on
      // the unique index. Same answer as the check above, not the raw
      // database error (SEC-044).
      if ((e as { code?: string }).code === "23505") throw new Error("EMAIL_ALREADY_REGISTERED");
      throw e;
    }
    await createSession(user.id, data.remember ?? true);
    return { ok: true };
  });

let dummyHashPromise: Promise<string> | null = null;
/** A valid hash of a random password, made once per process. */
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(crypto.randomUUID());
  return dummyHashPromise;
}

export const signIn = createServerFn({ method: "POST" })
  .validator((i) => signInSchema.parse(i))
  .handler(async ({ data }) => {
    const sql = getDb();
    // Same error for "malformed username", "no such user" and "wrong
    // password" — don't leak which one it was.
    const invalid = () => new Error("INVALID_CREDENTIALS");
    const loginId = parseLoginId(data.identifier);
    if (!loginId) throw invalid();
    const accountKey = `${loginId.kind === "email" ? "" : "nid:"}${loginId.value}`;

    // Counted before the lookup, so an attempt against a username that has
    // no account still consumes allowance. Checking only real accounts would
    // let the throttle itself confirm which usernames are registered.
    await applyLimit(`signin:${accountKey}`, LOGIN_LIMITS.perAccount);
    await applyLimit(`signin-ip:${clientKey()}`, LOGIN_LIMITS.perClient);

    const rows =
      loginId.kind === "email"
        ? await sql<{ id: string; password_hash: string }[]>`
            SELECT id, password_hash FROM users WHERE email = ${loginId.value}
          `
        : await sql<{ id: string; password_hash: string }[]>`
            SELECT id, password_hash FROM users WHERE national_id = ${loginId.value}
          `;
    if (!rows.length) {
      // Pay the same scrypt cost as a real account would, so the response
      // time does not reveal which usernames exist (including the second
      // check verifyLoginPassword makes for a password with Persian digits).
      await verifyLoginPassword(data.password, await dummyHash());
      throw invalid();
    }
    const ok = await verifyLoginPassword(data.password, rows[0].password_hash);
    if (!ok) throw invalid();

    // A hash from before the current scrypt cost is replaced now that the
    // password is known (password.server.ts, SEC-056). Only if it is still
    // the one just checked, so a password change made meanwhile is kept;
    // housekeeping, so it cannot fail the login.
    if (needsRehash(rows[0].password_hash)) {
      try {
        await sql`
          UPDATE users SET password_hash = ${await hashPassword(canonicalPassword(data.password))}
          WHERE id = ${rows[0].id} AND password_hash = ${rows[0].password_hash}
        `;
      } catch {
        /* stays on the old hash until the next sign-in */
      }
    }

    // A correct password clears the account's counter, so a user who fumbles
    // a few times and then succeeds is not left throttled — only a run of
    // failures keeps the limit in force. Housekeeping, so it cannot be the
    // thing that fails an otherwise successful login.
    try {
      await sql`DELETE FROM rate_limit_hits WHERE bucket = ${`signin:${accountKey}`}`;
    } catch {
      /* the counter simply expires on its own instead */
    }

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

const changePasswordSchema = z.object({
  // Required unless the account is on its bootstrap password (the forced
  // first-login change), so a stolen session alone cannot lock the real
  // owner out by changing the password.
  currentPassword: z.string().min(1).max(256).optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(256),
});

// requireAuth, not requireMfaVerified: this is the one action a
// must_change_password account needs to reach before anything else, and
// gating it behind the (unrelated, phone-OTP-based) MFA step would add
// friction for no benefit.
export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((i) => changePasswordSchema.parse(i))
  .handler(async ({ data, context }) => {
    const sql = getDb();
    const newPassword = canonicalPassword(data.newPassword);
    // The forced first-login change exists to replace a bootstrap password
    // (a mobile number on file with the park) with one only the company
    // knows; "changing" it to the same value would defeat that silently.
    const [current] = await sql<{ password_hash: string; must_change_password: boolean }[]>`
      SELECT password_hash, must_change_password FROM users WHERE id = ${context.user.id}
    `;
    if (!current) throw new Error("Unauthorized: not signed in");
    if (!current.must_change_password) {
      // Without a limit this check is an unthrottled password-guessing oracle
      // for anyone holding the session (security-audit SEC-034).
      await applyLimit(`pwchange:${context.user.id}`, { limit: 5, windowSeconds: 900 });
      const ok =
        data.currentPassword !== undefined &&
        (await verifyLoginPassword(data.currentPassword, current.password_hash));
      if (!ok) throw new Error("INVALID_CURRENT_PASSWORD");
    }
    if (await verifyPassword(newPassword, current.password_hash)) {
      throw new Error("PASSWORD_UNCHANGED");
    }
    assertStrongPassword(newPassword, [context.user.email, context.user.nationalId]);
    const password_hash = await hashPassword(newPassword);
    await sql`
      UPDATE users SET password_hash = ${password_hash}, must_change_password = false
      WHERE id = ${context.user.id}
    `;
    // Anyone else signed in with the old password — the bootstrap mobile
    // number included — is signed out; this browser stays signed in.
    await destroyOtherSessions(context.user.id);
    return { ok: true };
  });
