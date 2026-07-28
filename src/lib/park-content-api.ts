import { supabase } from "@/integrations/supabase/client";

export type ParkContent = {
  park_id: string;
  display_name: string | null;
  description: string | null;
  logo_url: string | null;
};
export type ParkImage = {
  id: string;
  park_id: string;
  image_url: string;
  caption: string | null;
  sort_order: number;
};
export type ParkNews = {
  id: string;
  park_id: string;
  title: string;
  body: string | null;
  published_at: string;
};

export async function fetchParkContent(parkId: string) {
  const [content, images, news] = await Promise.all([
    supabase.from("park_content").select("*").eq("park_id", parkId).maybeSingle(),
    supabase.from("park_images").select("*").eq("park_id", parkId).order("sort_order"),
    supabase.from("park_news").select("*").eq("park_id", parkId).order("published_at", { ascending: false }),
  ]);
  return {
    content: (content.data ?? null) as ParkContent | null,
    images: (images.data ?? []) as ParkImage[],
    news: (news.data ?? []) as ParkNews[],
  };
}

export async function upsertParkContent(c: ParkContent) {
  return supabase.from("park_content").upsert(c, { onConflict: "park_id" });
}

export async function uploadParkAsset(parkId: string, file: File) {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${parkId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("park-assets").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function addParkImage(parkId: string, image_url: string, caption: string | null = null) {
  return supabase.from("park_images").insert({ park_id: parkId, image_url, caption, sort_order: 0 });
}
export async function deleteParkImage(id: string) {
  return supabase.from("park_images").delete().eq("id", id);
}
export async function upsertParkNews(n: Partial<ParkNews> & { park_id: string; title: string }) {
  if (n.id) return supabase.from("park_news").update({ title: n.title, body: n.body }).eq("id", n.id);
  return supabase.from("park_news").insert({ park_id: n.park_id, title: n.title, body: n.body ?? null });
}
export async function deleteParkNews(id: string) {
  return supabase.from("park_news").delete().eq("id", id);
}
