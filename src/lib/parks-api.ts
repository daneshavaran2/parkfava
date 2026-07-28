import { supabase } from "@/integrations/supabase/client";

export type Park = {
  park_id: string;
  name: string;
  province: string | null;
  city: string | null;
  mx: number;
  my: number;
  color: string;
  companies_hint: number;
  jobs: number;
  area: number;
  is_active: boolean;
  sort_order: number;
};

export async function fetchParks(): Promise<Park[]> {
  const { data } = await supabase
    .from("parks" as any)
    .select("*")
    .order("sort_order", { ascending: true });
  return ((data ?? []) as any) as Park[];
}

export async function fetchActiveParks(): Promise<Park[]> {
  const { data } = await supabase
    .from("parks" as any)
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as any) as Park[];
}

export async function upsertPark(p: Partial<Park> & { park_id: string; name: string }) {
  return supabase.from("parks" as any).upsert(p as any, { onConflict: "park_id" });
}

export async function deletePark(park_id: string) {
  return supabase.from("parks" as any).delete().eq("park_id", park_id);
}

/**
 * Re-numbers sort_order according to the given id sequence.
 * Admin-only (RLS enforces).
 */
export async function reorderParks(ids: string[]) {
  const results = await Promise.all(
    ids.map((park_id, i) =>
      supabase.from("parks" as any).update({ sort_order: i + 1 } as any).eq("park_id", park_id),
    ),
  );
  const err = results.find((r) => r.error);
  return err ?? { error: null };
}
