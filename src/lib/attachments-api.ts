import { supabase } from "@/integrations/supabase/client";

export type AttachmentKind =
  | "logo"
  | "gallery_image"
  | "catalog"
  | "form_fa"
  | "form_en"
  | "document"
  | "other";

export type CompanyAttachment = {
  id: string;
  owner_type: "exhibition" | "park";
  owner_id: string;
  kind: AttachmentKind;
  title: string | null;
  description: string | null;
  file_url: string;
  mime_type: string | null;
  size_bytes: number | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const TABLE = "company_attachments" as const;

export async function fetchAttachments(
  ownerType: "exhibition" | "park",
  ownerId: string,
) {
  const { data, error } = await supabase
    .from(TABLE as any)
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("kind")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as unknown as CompanyAttachment[];
}

export async function uploadAttachment(opts: {
  ownerType: "exhibition" | "park";
  ownerId: string;
  kind: AttachmentKind;
  file: File;
  title?: string | null;
  description?: string | null;
}) {
  const { file, ownerType, ownerId, kind, title, description } = opts;
  const ext = file.name.split(".").pop() || "bin";
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `attachments/${ownerType}/${ownerId}/${kind}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from("park-assets")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from(TABLE as any)
    .insert({
      owner_type: ownerType,
      owner_id: ownerId,
      kind,
      file_url: path,
      title: title ?? file.name,
      description: description ?? null,
      mime_type: file.type || null,
      size_bytes: file.size,
      sort_order: 0,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as CompanyAttachment;
}

export async function updateAttachment(
  id: string,
  patch: Partial<Pick<CompanyAttachment, "title" | "description" | "kind" | "sort_order" | "is_active">>,
) {
  return supabase.from(TABLE as any).update(patch).eq("id", id);
}

export async function deleteAttachment(att: CompanyAttachment) {
  // remove file from storage (best effort)
  if (att.file_url && !att.file_url.startsWith("http")) {
    await supabase.storage.from("park-assets").remove([att.file_url]).catch(() => {});
  }
  return supabase.from(TABLE as any).delete().eq("id", att.id);
}

export async function reorderAttachments(ids: string[]) {
  await Promise.all(
    ids.map((id, i) => supabase.from(TABLE as any).update({ sort_order: i }).eq("id", id)),
  );
}

export type AttachmentWithOwner = CompanyAttachment & { owner_name?: string | null };

export async function fetchAllAttachments(filters: {
  ownerType?: "exhibition" | "park";
  kind?: AttachmentKind;
  isActive?: boolean;
  search?: string;
} = {}): Promise<CompanyAttachment[]> {
  let q = supabase.from(TABLE as any).select("*").order("created_at", { ascending: false });
  if (filters.ownerType) q = q.eq("owner_type", filters.ownerType);
  if (filters.kind) q = q.eq("kind", filters.kind);
  if (typeof filters.isActive === "boolean") q = q.eq("is_active", filters.isActive);
  if (filters.search) q = q.ilike("title", `%${filters.search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as CompanyAttachment[];
}

export async function uploadAttachmentFromBlob(opts: {
  ownerType: "exhibition" | "park";
  ownerId: string;
  kind: AttachmentKind;
  blob: Blob;
  filename: string;
  title?: string | null;
  mime?: string;
}) {
  const { blob, ownerType, ownerId, kind, filename, title, mime } = opts;
  const file = new File([blob], filename, { type: mime || blob.type || "application/octet-stream" });
  return uploadAttachment({ ownerType, ownerId, kind, file, title });
}

export const KIND_LABELS: Record<AttachmentKind, string> = {
  logo: "Logo",
  gallery_image: "Gallery images",
  catalog: "Product catalog",
  form_fa: "Persian forms/docs",
  form_en: "English forms/docs",
  document: "Documents",
  other: "Other",
};

export const KIND_ACCEPT: Record<AttachmentKind, string> = {
  logo: "image/*",
  gallery_image: "image/*",
  catalog: ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  form_fa: ".pdf,.doc,.docx",
  form_en: ".pdf,.doc,.docx",
  document: "*/*",
  other: "*/*",
};
