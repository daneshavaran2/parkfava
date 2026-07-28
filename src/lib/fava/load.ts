// @ts-nocheck
/**
 * Loads the FAVA vendor bundle on the client, then hydrates window.FAVA.PARKS
 * from the database so admins can add/remove/edit parks without a code change.
 */
import { fetchActiveParks } from "@/lib/parks-api";

let loaded = false;
let loading: Promise<void> | null = null;

export function loadFavaVendor(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (loaded) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    await Promise.all([
      import("./data.js"),
      import("./iran-map.js"),
      import("./qr.js"),
      import("./image-slot.js"),
    ]);
    try {
      const rows = await fetchActiveParks();
      if (rows.length && (window as any).FAVA) {
        const fallback = (window as any).FAVA.PARKS ?? [];
        (window as any).FAVA.PARKS = rows.map((r) => {
          const prev = fallback.find((p: any) => p.id === r.park_id) ?? {};
          return {
            ...prev,
            id: r.park_id,
            name: r.name,
            province: r.province ?? prev.province ?? "",
            city: r.city ?? prev.city ?? "",
            companies: r.companies_hint || prev.companies || 0,
            jobs: r.jobs || prev.jobs || 0,
            area: r.area || prev.area || 0,
            color: r.color || prev.color || "blue",
            mx: Number(r.mx),
            my: Number(r.my),
          };
        });
      }
    } catch {
      /* keep vendor defaults if DB unreachable */
    }
    loaded = true;
  })();
  return loading;
}
