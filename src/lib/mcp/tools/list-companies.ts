import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_companies",
  title: "List exhibition companies",
  description:
    "List active exhibition companies visible to the signed-in user, optionally filtered by park, city, or category. Returns basic profile fields.",
  inputSchema: {
    park_id: z.string().optional().describe("Filter by park id."),
    city: z.string().optional().describe("Filter by city name."),
    category: z.string().optional().describe("Filter by category."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ park_id, city, category, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("exhibition_companies")
      .select(
        "company_id,name,tagline,city,category,park_id,website,phone,email,latitude,longitude,status,is_active",
      )
      .limit(limit ?? 50);
    if (park_id) q = q.eq("park_id", park_id);
    if (city) q = q.eq("city", city);
    if (category) q = q.eq("category", category);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { companies: data ?? [] },
    };
  },
});
