import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaVerified } from "@/integrations/supabase/mfa-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  roles: string[];
  owned_company_ids: string[];
};

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireMfaVerified])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw new Error(error.message);
    const ids = users.users.map((u) => u.id);
    const [{ data: roles }, { data: comps }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("exhibition_companies").select("company_id, owner_user_id").in("owner_user_id", ids),
    ]);
    return users.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      roles: (roles ?? []).filter((r: any) => r.user_id === u.id).map((r: any) => r.role),
      owned_company_ids: (comps ?? []).filter((c: any) => c.owner_user_id === u.id).map((c: any) => c.company_id),
    }));
  });

export const grantAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.user_id, role: "admin" }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId) throw new Error("Cannot revoke your own admin role");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", "admin");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignCompanyOwner = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({
    company_id: z.string().min(1).max(120),
    user_id: z.string().uuid().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("exhibition_companies")
      .update({ owner_user_id: data.user_id })
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    if (data.user_id) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: "company_owner" }, { onConflict: "user_id,role" });
    }
    return { ok: true };
  });

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireMfaVerified])
  .handler(async ({ context }): Promise<{ roles: string[]; owned_company_id: string | null }> => {
    const [{ data: roles }, { data: owned }] = await Promise.all([
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.from("exhibition_companies").select("company_id").eq("owner_user_id", context.userId).maybeSingle(),
    ]);
    return {
      roles: (roles ?? []).map((r: any) => r.role),
      owned_company_id: owned?.company_id ?? null,
    };
  });
