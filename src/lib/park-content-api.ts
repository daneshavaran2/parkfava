import {
  getParkContent,
  upsertParkContentAdmin,
  addParkImageAdmin,
  deleteParkImageAdmin,
  upsertParkNewsAdmin,
  deleteParkNewsAdmin,
  uploadParkAssetFn,
} from "./park-content.functions";

export type ParkContent = {
  park_id: string;
  display_name: string | null;
  description: string | null;
  logo_url: string | null;
  /** The park's own showcase film — an upload path served through /assets/$. */
  video_url?: string | null;
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
  /** Stored upload path, served through /assets/$ — not an embed URL. */
  video_url: string | null;
  published_at: string;
};

export async function fetchParkContent(parkId: string) {
  const { content, images, news } = await getParkContent({ data: { parkId } });
  return {
    content: (content ?? null) as ParkContent | null,
    images: (images ?? []) as ParkImage[],
    news: (news ?? []) as ParkNews[],
  };
}

export async function upsertParkContent(c: ParkContent) {
  try {
    await upsertParkContentAdmin({ data: c });
    return { error: null };
  } catch (e: any) {
    return { error: e };
  }
}

export async function uploadParkAsset(parkId: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  form.set("park_id", parkId);
  const { path } = await uploadParkAssetFn({ data: form });
  return path;
}

export async function addParkImage(parkId: string, image_url: string, caption: string | null = null) {
  return addParkImageAdmin({ data: { park_id: parkId, image_url, caption } });
}
export async function deleteParkImage(id: string) {
  return deleteParkImageAdmin({ data: { id } });
}
export async function upsertParkNews(n: Partial<ParkNews> & { park_id: string; title: string }) {
  return upsertParkNewsAdmin({
    data: {
      id: n.id,
      park_id: n.park_id,
      title: n.title,
      body: n.body ?? null,
      video_url: n.video_url ?? null,
    },
  });
}
export async function deleteParkNews(id: string) {
  return deleteParkNewsAdmin({ data: { id } });
}
