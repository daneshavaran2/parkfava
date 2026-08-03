/**
 * Layered auth middleware (requireAuth -> requireAdmin / requireMfaVerified)
 * reading the session cookie + `sessions`/`users`/`user_roles` tables — no
 * client-attached Authorization header is needed since cookies travel
 * automatically with same-origin requests.
 */
import { createMiddleware } from "@tanstack/react-start";
import { getSessionUser } from "./session.server";

export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized: not signed in");
  return next({ context: { user } });
});

export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireAuth])
  .server(async ({ next, context }) => {
    if (!context.user.roles.includes("admin")) throw new Error("Forbidden: admin role required");
    return next();
  });

// Step-up SMS-OTP check on top of requireAuth. Off by default: until
// MFA_ENFORCED="true" is set, this behaves exactly like requireAuth so
// logins are unaffected. See src/lib/mfa.functions.ts for the
// request/verify flow (Phase 3 rewires that to the new users table).
export const requireMfaVerified = createMiddleware({ type: "function" })
  .middleware([requireAuth])
  .server(async ({ next, context }) => {
    if (process.env.MFA_ENFORCED !== "true") return next();
    if (!context.user.mfaVerified) throw new Error("MFA_REQUIRED");
    return next();
  });
