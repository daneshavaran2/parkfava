// Runtime i18n gate. Complements the build-time lint (`scripts/lint-i18n.ts`).
//
// Rule: server-emitted error messages must be English so stack traces and
// Sentry/Logflare queries stay searchable. Persian user-visible strings must
// come from the UI layer, never from server errors.
//
// The middleware inspects thrown `Error.message` (narrow, low false-positive)
// and, if it contains any Arabic-script codepoint (U+0600–U+06FF), replaces
// the message with a standard English sentence before rethrowing. The
// original message is logged with `event: "i18n_violation"` for debugging.
import { createMiddleware } from "@tanstack/react-start";
import { logError } from "./log-envelope";

const PERSIAN = /[\u0600-\u06FF]/;

export function containsPersian(value: unknown): boolean {
  return typeof value === "string" && PERSIAN.test(value);
}

export function assertEnglishOnly(value: string, context: string): void {
  if (PERSIAN.test(value)) {
    throw new Error(
      `i18n violation: Persian text is not allowed in server payloads. Context: ${context}`,
    );
  }
}

export function wrapErrorIfPersian(error: unknown): unknown {
  if (error instanceof Error && containsPersian(error.message)) {
    logError({
      event: "i18n_violation",
      message: "Persian text detected in thrown Error.message",
      meta: { original: error.message, stack: error.stack },
    });
    const replacement = new Error(
      "Internal server error. Server-side messages must be English; see logs for the original text.",
    );
    replacement.stack = error.stack;
    return replacement;
  }
  return error;
}

export const i18nGuardMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      throw wrapErrorIfPersian(error);
    }
  },
);
