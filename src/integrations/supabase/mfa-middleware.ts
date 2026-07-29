import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

// Step-up SMS-OTP check on top of requireSupabaseAuth. Off by default:
// until MFA_ENFORCED="true" is set (which should only happen once an SMS
// panel is actually wired up in src/lib/sms/send-sms.server.ts), this
// behaves exactly like requireSupabaseAuth so existing logins are
// unaffected. See src/lib/mfa.functions.ts for the request/verify flow.
export const requireMfaVerified = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    if (process.env.MFA_ENFORCED !== "true") return next();

    const meta = ((context.claims as any)?.user_metadata ?? {}) as Record<string, any>;
    const expiresAt = meta.mfa_token_expires_at ? new Date(meta.mfa_token_expires_at).getTime() : 0;
    if (!meta.mfa_token || expiresAt < Date.now()) {
      throw new Error("MFA_REQUIRED: تایید پیامکی نیاز است");
    }
    return next();
  });
