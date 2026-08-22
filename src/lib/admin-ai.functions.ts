import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../../db/connection";
import { requireAdmin } from "./auth/middleware";
import { encryptSecret, getAssistantSettingsForAdmin } from "./app-settings.server";

export const getAdminAiSettings = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => getAssistantSettingsForAdmin());

export const saveAdminAiSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input) => z.object({
    apiKey: z.string().trim().max(500).optional(),
    model: z.string().trim().min(1).max(200),
    enabled: z.boolean(),
    clearKey: z.boolean().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const sql = getDb();
    const apiKey = data.apiKey?.trim();
    const encrypted = apiKey ? encryptSecret(apiKey) : null;
    await sql`
      UPDATE assistant_settings SET
        model = ${data.model},
        is_enabled = ${data.enabled},
        api_key_encrypted = CASE
          WHEN ${data.clearKey === true} THEN NULL
          WHEN ${!!encrypted} THEN ${encrypted}
          ELSE api_key_encrypted
        END,
        api_key_last_four = CASE
          WHEN ${data.clearKey === true} THEN NULL
          WHEN ${!!apiKey} THEN ${apiKey ? apiKey.slice(-4) : null}
          ELSE api_key_last_four
        END,
        updated_by = ${context.user.id},
        updated_at = now()
      WHERE id = true
    `;
    return getAssistantSettingsForAdmin();
  });
