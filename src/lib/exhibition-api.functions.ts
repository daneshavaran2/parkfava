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

// Shared by every mutation below: admins can edit any company, owners only
// their own. These run through the RLS-scoped user client (context.supabase,
// not the service-role client), so this check is defense-in-depth on top of
// RLS, matching the pattern already used by saveAdminCompany/listAdminCompanies.
async function assertCanEditCompany(context: { supabase: any; userId: string }, company_id: string) {
  const [{ data: isAdmin, error: roleError }, { data: company, error: companyError }] = await Promise.all([
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle(),
    context.supabase.from("exhibition_companies").select("owner_user_id").eq("company_id", company_id).maybeSingle(),
  ]);
  if (roleError) throw new Error(roleError.message);
  if (companyError) throw new Error(companyError.message);
  if (isAdmin) return;
  if (company?.owner_user_id === context.userId) return;
  throw new Error("Forbidden");
}

export const submitCompanyForReview = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ company_id: z.string().trim().min(1).max(120) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanEditCompany(context, data.company_id);
    const { error } = await context.supabase
      .from("exhibition_companies")
      .update({ status: "pending", submitted_at: new Date().toISOString() } as any)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addExhibitionImage = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({
    company_id: z.string().trim().min(1).max(120),
    image_url: z.string().trim().min(1).max(1000),
    caption: nullableText,
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanEditCompany(context, data.company_id);
    const { error } = await context.supabase
      .from("exhibition_images")
      .insert({ company_id: data.company_id, image_url: data.image_url, caption: data.caption ?? null, sort_order: 0 } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteExhibitionImage = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: img, error: imgErr } = await context.supabase
      .from("exhibition_images").select("company_id").eq("id", data.id).maybeSingle();
    if (imgErr) throw new Error(imgErr.message);
    if (!img) throw new Error("یافت نشد");
    await assertCanEditCompany(context, img.company_id);
    const { error } = await context.supabase.from("exhibition_images").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const productWriteSchema = z.object({
  id: z.string().uuid().optional(),
  company_id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(255),
  description: nullableText,
  image_url: nullableUrlText,
  video_url: nullableUrlText,
  catalog_url: nullableUrlText,
  link_url: nullableUrlText,
  sort_order: z.number().int().nullable().optional(),
});

export const upsertExhibitionProduct = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => productWriteSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertCanEditCompany(context, data.company_id);
    const { id, ...rest } = data;
    const table = context.supabase.from("exhibition_products" as any);
    const { error } = id
      ? await table.update(rest as any).eq("id", id)
      : await table.insert(rest as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteExhibitionProduct = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: prod, error: prodErr } = await context.supabase
      .from("exhibition_products" as any).select("company_id").eq("id", data.id).maybeSingle();
    if (prodErr) throw new Error(prodErr.message);
    if (!prod) throw new Error("یافت نشد");
    await assertCanEditCompany(context, (prod as any).company_id);
    const { error } = await context.supabase.from("exhibition_products" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function assertIsAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase
    .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden");
}

export const deleteExhibitionCompanyAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ company_id: z.string().trim().min(1).max(120) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertIsAdmin(context);
    const { error } = await context.supabase.from("exhibition_companies").delete().eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderExhibitionCompaniesAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ ids: z.array(z.string().trim().min(1).max(120)) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertIsAdmin(context);
    const results = await Promise.all(
      data.ids.map((id, i) => context.supabase.from("exhibition_companies").update({ sort_order: i }).eq("company_id", id)),
    );
    const err = results.find((r: any) => r.error);
    if (err) throw new Error(err.error!.message);
    return { ok: true };
  });

export const approveCompanyAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ company_id: z.string().trim().min(1).max(120) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertIsAdmin(context);
    const { error } = await context.supabase
      .from("exhibition_companies")
      .update({
        status: "approved", is_active: true,
        reviewed_at: new Date().toISOString(), reviewed_by: context.userId, rejection_note: null,
      } as any)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rejectCompanyAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ company_id: z.string().trim().min(1).max(120), note: z.string().trim().max(2000) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertIsAdmin(context);
    const { error } = await context.supabase
      .from("exhibition_companies")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(), reviewed_by: context.userId, rejection_note: data.note,
      } as any)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateExhibitionImage = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ id: z.string().uuid(), caption: nullableText }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: img, error: imgErr } = await context.supabase
      .from("exhibition_images").select("company_id").eq("id", data.id).maybeSingle();
    if (imgErr) throw new Error(imgErr.message);
    if (!img) throw new Error("یافت نشد");
    await assertCanEditCompany(context, img.company_id);
    const { error } = await context.supabase.from("exhibition_images").update({ caption: data.caption ?? null }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderExhibitionImages = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: img, error: imgErr } = await context.supabase
      .from("exhibition_images").select("company_id").eq("id", data.ids[0]).maybeSingle();
    if (imgErr) throw new Error(imgErr.message);
    if (!img) throw new Error("یافت نشد");
    await assertCanEditCompany(context, img.company_id);
    const results = await Promise.all(
      data.ids.map((id, i) => context.supabase.from("exhibition_images").update({ sort_order: i }).eq("id", id)),
    );
    const err = results.find((r: any) => r.error);
    if (err) throw new Error(err.error!.message);
    return { ok: true };
  });

export const reorderExhibitionProducts = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: prod, error: prodErr } = await context.supabase
      .from("exhibition_products" as any).select("company_id").eq("id", data.ids[0]).maybeSingle();
    if (prodErr) throw new Error(prodErr.message);
    if (!prod) throw new Error("یافت نشد");
    await assertCanEditCompany(context, (prod as any).company_id);
    const results = await Promise.all(
      data.ids.map((id, i) => context.supabase.from("exhibition_products" as any).update({ sort_order: i }).eq("id", id)),
    );
    const err = results.find((r: any) => r.error);
    if (err) throw new Error(err.error!.message);
    return { ok: true };
  });