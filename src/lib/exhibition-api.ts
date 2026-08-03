import {
  getExhibitionCompanies,
  getPublicExhibitionProducts,
  getExhibitionCompanyDetail,
  getMyCompany,
  uploadExhibitionAssetFn,
} from "./exhibition-api.functions";
import {
  getAboutSections,
  upsertAboutSectionAdmin,
  deleteAboutSectionAdmin,
  uploadAboutAssetFn,
} from "./about-sections.functions";

export type ExhibitionCompany = {
  company_id: string;
  name: string;
  name_en?: string | null;
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
  const company = await getMyCompany();
  return (company ?? null) as ExhibitionCompany | null;
}

/* ============ READS ============ */

export async function fetchExhibitionCompanies() {
  const data = await getExhibitionCompanies();
  return (data ?? []) as ExhibitionCompany[];
}

/** Products belonging to publicly-visible (approved + active) companies only. */
export async function fetchPublicExhibitionProducts(companyIds: string[]) {
  if (!companyIds.length) return [] as ExhibitionProduct[];
  const data = await getPublicExhibitionProducts({ data: { companyIds } });
  return (data ?? []) as ExhibitionProduct[];
}

export async function fetchExhibitionCompany(id: string) {
  const { company, images, products } = await getExhibitionCompanyDetail({ data: { id } });
  return {
    company: (company ?? null) as ExhibitionCompany | null,
    images: (images ?? []) as ExhibitionImage[],
    products: (products ?? []) as ExhibitionProduct[],
  };
}

/* ============ PRODUCTS ============ */

export async function uploadExhibitionAsset(company_id: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  form.set("company_id", company_id);
  const { path } = await uploadExhibitionAssetFn({ data: form });
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
  const data = await getAboutSections();
  return (data ?? []) as AboutSection[];
}

export async function upsertAboutSection(s: Partial<AboutSection> & { section_key: string }) {
  return upsertAboutSectionAdmin({ data: s as any });
}

export async function deleteAboutSection(id: string) {
  return deleteAboutSectionAdmin({ data: { id } });
}

export async function uploadAboutAsset(file: File) {
  const form = new FormData();
  form.set("file", file);
  const { path } = await uploadAboutAssetFn({ data: form });
  return path;
}
