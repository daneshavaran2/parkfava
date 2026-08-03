import {
  getAttachments,
  getAttachmentsAdmin,
  getAllAttachmentsAdmin,
  updateAttachmentAdmin,
  deleteAttachmentAdmin,
  reorderAttachmentsAdmin,
  uploadAttachmentFn,
} from "./attachments.functions";

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

/** Public-facing (only active rows) — safe to call from unauthenticated pages. */
export async function fetchAttachments(ownerType: "exhibition" | "park", ownerId: string) {
  const data = await getAttachments({ data: { ownerType, ownerId } });
  return (data ?? []) as CompanyAttachment[];
}

/** Admin-facing (every row, active or not). */
export async function fetchAttachmentsAdmin(ownerType: "exhibition" | "park", ownerId: string) {
  const data = await getAttachmentsAdmin({ data: { ownerType, ownerId } });
  return (data ?? []) as CompanyAttachment[];
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
  const form = new FormData();
  form.set("file", file);
  form.set("ownerType", ownerType);
  form.set("ownerId", ownerId);
  form.set("kind", kind);
  if (title != null) form.set("title", title);
  if (description != null) form.set("description", description);
  return (await uploadAttachmentFn({ data: form })) as unknown as CompanyAttachment;
}

export async function updateAttachment(
  id: string,
  patch: Partial<Pick<CompanyAttachment, "title" | "description" | "kind" | "sort_order" | "is_active">>,
) {
  return updateAttachmentAdmin({ data: { id, ...patch } });
}

export async function deleteAttachment(att: CompanyAttachment) {
  return deleteAttachmentAdmin({ data: { id: att.id } });
}

export async function reorderAttachments(ids: string[]) {
  return reorderAttachmentsAdmin({ data: { ids } });
}

export type AttachmentWithOwner = CompanyAttachment & { owner_name?: string | null };

export async function fetchAllAttachments(filters: {
  ownerType?: "exhibition" | "park";
  kind?: AttachmentKind;
  isActive?: boolean;
  search?: string;
} = {}): Promise<CompanyAttachment[]> {
  const data = await getAllAttachmentsAdmin({ data: filters });
  return (data ?? []) as CompanyAttachment[];
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
