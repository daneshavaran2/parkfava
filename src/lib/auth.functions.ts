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

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signUp = createServerFn({ method: "POST" })
  .inputValidator((i) => credentialsSchema.parse(i))
  .handler(async ({ data }) => {
    const sql = getDb();
    const email = data.email.trim().toLowerCase();
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length) throw new Error("EMAIL_ALREADY_REGISTERED");

    const password_hash = await hashPassword(data.password);
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, ${password_hash})
      RETURNING id
    `;
    await createSession(user.id);
    return { ok: true };
  });

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((i) => credentialsSchema.parse(i))
  .handler(async ({ data }) => {
    const sql = getDb();
    const email = data.email.trim().toLowerCase();
    const rows = await sql<{ id: string; password_hash: string }[]>`
      SELECT id, password_hash FROM users WHERE email = ${email}
    `;
    // Same error for "no such user" and "wrong password" — don't leak
    // which one it was.
    const invalid = () => new Error("INVALID_CREDENTIALS");
    if (!rows.length) throw invalid();
    const ok = await verifyPassword(data.password, rows[0].password_hash);
    if (!ok) throw invalid();

    await createSession(rows[0].id);
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
