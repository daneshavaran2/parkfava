import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaVerified } from "@/integrations/supabase/mfa-middleware";
import { parseLatLngValue } from "@/lib/geo";

const nullableText = z.string().trim().max(4000).nullable().optional();
const nullableUrlText = z.string().trim().max(1000).nullable().optional();

const companyPatchSchema = z.object({
  company_id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(255).optional(),
  tagline: nullableText,
  category: z.string().trim().max(120).nullable().optional(),
  park_id: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  description: nullableText,
  logo_url: nullableUrlText,
  website: nullableUrlText,
  phone: z.string().trim().max(80).nullable().optional(),
  email: z.string().trim().max(255).nullable().optional(),
  address: nullableText,
  sort_order: z.number().int().nullable().optional(),
  is_active: z.boolean().optional(),
  catalog_url: nullableUrlText,
  video_url: nullableUrlText,
  founded_at: z.string().trim().max(80).nullable().optional(),
  intro: nullableText,
  founders: nullableText,
  export_potential: nullableText,
  headcount: z.number().int().min(0).nullable().optional(),
  headcount_full_time: z.number().int().min(0).nullable().optional(),
  headcount_part_time: z.number().int().min(0).nullable().optional(),
  knowledge_products_intro: nullableText,
  linkedin_url: nullableUrlText,
  owner_user_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "pending", "approved", "rejected"]).nullable().optional(),
  submitted_at: z.string().nullable().optional(),
  reviewed_at: z.string().nullable().optional(),
  reviewed_by: z.string().uuid().nullable().optional(),
  rejection_note: nullableText,
  latitude: z.union([z.string(), z.number(), z.null()]).optional(),
  longitude: z.union([z.string(), z.number(), z.null()]).optional(),
  map_zoom: z.number().int().min(1).max(22).nullable().optional(),
}).passthrough();

export const saveAdminCompany = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((input) => companyPatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Forbidden");

    const patch: Record<string, unknown> = { ...(data as Record<string, unknown>) };
    const lat = parseLatLngValue(patch["latitude"], "lat");
    const lng = parseLatLngValue(patch["longitude"], "lng");
    if (!lat.ok || !lng.ok) throw new Error("Invalid latitude or longitude");
    patch["latitude"] = lat.value;
    patch["longitude"] = lng.value;
    const { error } = await context.supabase
      .from("exhibition_companies")
      .upsert(patch as any, { onConflict: "company_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAdminCompanies = createServerFn({ method: "GET" })
  .middleware([requireMfaVerified])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { data, error } = await context.supabase
      .from("exhibition_companies")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveOwnedCompany = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((input) => z.object({
    company_id: z.string().trim().min(1).max(120),
    patch: companyPatchSchema.partial(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { status, is_active, owner_user_id, reviewed_at, reviewed_by, company_id: _ignored, ...safe } = data.patch as any;
    const patch: Record<string, unknown> = { ...(safe as Record<string, unknown>) };
    const lat = parseLatLngValue(patch["latitude"], "lat");
    const lng = parseLatLngValue(patch["longitude"], "lng");
    if (!lat.ok || !lng.ok) throw new Error("Invalid latitude or longitude");
    patch["latitude"] = lat.value;
    patch["longitude"] = lng.value;
    const { error } = await context.supabase
      .from("exhibition_companies")
      .update(patch as any)
      .eq("company_id", data.company_id)
      .eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });