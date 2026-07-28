import { supabase } from "@/integrations/supabase/client";

export type ExhibitionCompany = {
  company_id: string;
  name: string;
  tagline: string | null;
  category: string | null;
  park_id: string | null;
  city: string | null;
  description: string | null;
  logo_url: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  sort_order: number;
  is_active: boolean;
  catalog_url?: string | null;
  video_url?: string | null;
  founded_at?: string | null;
  intro?: string | null;
  founders?: string | null;
  export_potential?: string | null;
  headcount?: number | null;
  headcount_full_time?: number | null;
  headcount_part_time?: number | null;
  knowledge_products_intro?: string | null;
  linkedin_url?: string | null;
  owner_user_id?: string | null;
  status?: "draft" | "pending" | "approved" | "rejected" | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rejection_note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  map_zoom?: number | null;
};

export type ExhibitionImage = {
  id: string;
  company_id: string;
  image_url: string;
  caption: string | null;
  sort_order: number;
};

export type ExhibitionProduct = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  video_url: string | null;
  catalog_url: string | null;
  link_url: string | null;
  sort_order: number;
};

/* ============ OWNERSHIP / APPROVAL ============ */

export async function fetchMyCompany() {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from("exhibition_companies")
    .select("*")
    .eq("owner_user_id", uid)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as ExhibitionCompany | null;
}

export async function createOwnedCompany(payload: {
  company_id: string;
  name: string;
  category?: string | null;
  city?: string | null;
  tagline?: string | null;
  description?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
}) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("Sign-in is required to register a company.");
  return supabase.from("exhibition_companies").insert({
    ...payload,
    owner_user_id: uid,
    status: "draft",
    is_active: false,
    sort_order: 9999,
  } as any);
}

export async function updateOwnedCompany(company_id: string, patch: Partial<ExhibitionCompany>) {
  // owner cannot flip status to approved or set is_active=true (RLS enforces this too)
  const { status, is_active, owner_user_id, reviewed_at, reviewed_by, ...safe } = patch as any;
  return supabase.from("exhibition_companies").update(safe).eq("company_id", company_id);
}

export async function submitCompanyForReview(company_id: string) {
  return supabase
    .from("exhibition_companies")
    .update({ status: "pending", submitted_at: new Date().toISOString() } as any)
    .eq("company_id", company_id);
}

export async function approveCompany(company_id: string) {
  const { data: userRes } = await supabase.auth.getUser();
  return supabase
    .from("exhibition_companies")
    .update({
      status: "approved",
      is_active: true,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userRes.user?.id ?? null,
      rejection_note: null,
    } as any)
    .eq("company_id", company_id);
}

export async function rejectCompany(company_id: string, note: string) {
  const { data: userRes } = await supabase.auth.getUser();
  return supabase
    .from("exhibition_companies")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: userRes.user?.id ?? null,
      rejection_note: note,
    } as any)
    .eq("company_id", company_id);
}


export async function fetchExhibitionCompanies() {
  const { data } = await supabase
    .from("exhibition_companies")
    .select("*")
    .eq("status", "approved")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []) as ExhibitionCompany[];
}

export async function fetchAllCompaniesAdmin() {
  const { data, error } = await supabase
    .from("exhibition_companies")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ExhibitionCompany[];
}

export async function fetchExhibitionCompany(id: string) {
  const [c, imgs, prods] = await Promise.all([
    supabase.from("exhibition_companies").select("*").eq("company_id", id).maybeSingle(),
    supabase.from("exhibition_images").select("*").eq("company_id", id).order("sort_order"),
    supabase.from("exhibition_products" as any).select("*").eq("company_id", id).order("sort_order"),
  ]);
  return {
    company: (c.data ?? null) as ExhibitionCompany | null,
    images: (imgs.data ?? []) as ExhibitionImage[],
    products: ((prods as any).data ?? []) as ExhibitionProduct[],
  };
}

export async function upsertExhibitionCompany(c: Partial<ExhibitionCompany> & { company_id: string; name: string }) {
  return supabase.from("exhibition_companies").upsert(c as any, { onConflict: "company_id" });
}

export async function deleteExhibitionCompany(company_id: string) {
  return supabase.from("exhibition_companies").delete().eq("company_id", company_id);
}

export async function addExhibitionImage(company_id: string, image_url: string, caption: string | null = null) {
  return supabase.from("exhibition_images").insert({ company_id, image_url, caption, sort_order: 0 });
}

export async function updateExhibitionImage(id: string, patch: Partial<Pick<ExhibitionImage, "caption" | "sort_order">>) {
  return supabase.from("exhibition_images").update(patch).eq("id", id);
}

export async function deleteExhibitionImage(id: string) {
  return supabase.from("exhibition_images").delete().eq("id", id);
}

export async function reorderExhibitionCompanies(ids: string[]) {
  await Promise.all(
    ids.map((id, i) =>
      supabase.from("exhibition_companies").update({ sort_order: i }).eq("company_id", id),
    ),
  );
}

export async function reorderExhibitionImages(ids: string[]) {
  await Promise.all(
    ids.map((id, i) => supabase.from("exhibition_images").update({ sort_order: i }).eq("id", id)),
  );
}

/* ============ PRODUCTS ============ */

export async function upsertExhibitionProduct(p: Partial<ExhibitionProduct> & { company_id: string; name: string }) {
  const table = supabase.from("exhibition_products" as any);
  if (p.id) {
    const { id, ...rest } = p;
    return table.update(rest as any).eq("id", id);
  }
  return table.insert(p as any);
}

export async function deleteExhibitionProduct(id: string) {
  return supabase.from("exhibition_products" as any).delete().eq("id", id);
}

export async function reorderExhibitionProducts(ids: string[]) {
  await Promise.all(
    ids.map((id, i) =>
      supabase.from("exhibition_products" as any).update({ sort_order: i }).eq("id", id),
    ),
  );
}

export async function uploadExhibitionAsset(company_id: string, file: File) {
  const ext = file.name.split(".").pop() || "bin";
  const path = `exhibition/${company_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("park-assets").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

/* ============ ABOUT ============ */

export type AboutSection = {
  id: string;
  section_key: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  video_url: string | null;
  video_url_2: string | null;
  sort_order: number;
  is_active: boolean;
};

export async function fetchAboutSections() {
  const { data } = await supabase
    .from("about_sections")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data ?? []) as AboutSection[];
}

export async function upsertAboutSection(s: Partial<AboutSection> & { section_key: string }) {
  if (s.id) {
    const { id, ...rest } = s;
    return supabase.from("about_sections").update(rest).eq("id", id);
  }
  return supabase.from("about_sections").insert(s);
}

export async function deleteAboutSection(id: string) {
  return supabase.from("about_sections").delete().eq("id", id);
}

export async function uploadAboutAsset(file: File) {
  const ext = file.name.split(".").pop() || "bin";
  const path = `about/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("park-assets").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}
