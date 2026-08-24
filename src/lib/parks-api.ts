import { getParks, getActiveParks, upsertParkAdmin, deleteParkAdmin, reorderParksAdmin } from "./parks.functions";

export type Park = {
  park_id: string;
  name: string;
  name_en?: string | null;
  province: string | null;
  province_en?: string | null;
  city: string | null;
  city_en?: string | null;
  mx: number;
  my: number;
  color: string;
  /** Live COUNT of approved+active exhibition_companies for this park — not stored, computed per query. */
  companies_count: number;
  jobs: number;
  area: number;
  is_active: boolean;
  sort_order: number;
};

export async function fetchParks(): Promise<Park[]> {
  const data = await getParks();
  return (data ?? []) as Park[];
}

export async function fetchActiveParks(): Promise<Park[]> {
  const data = await getActiveParks();
  return (data ?? []) as Park[];
}

export async function upsertPark(p: Partial<Park> & { park_id: string; name: string }) {
  try {
    await upsertParkAdmin({ data: p as any });
    return { error: null };
  } catch (e: any) {
    return { error: e };
  }
}

export async function deletePark(park_id: string) {
  try {
    await deleteParkAdmin({ data: { park_id } });
    return { error: null };
  } catch (e: any) {
    return { error: e };
  }
}

/**
 * Re-numbers sort_order according to the given id sequence.
 * Admin-only.
 */
export async function reorderParks(ids: string[]) {
  try {
    await reorderParksAdmin({ data: { ids } });
    return { error: null };
  } catch (e: any) {
    return { error: e };
  }
}
