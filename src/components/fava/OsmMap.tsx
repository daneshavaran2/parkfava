import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { buildGoogleMapsDirectionsUrl, buildNeshanUrl, formatCoordinate } from "@/lib/geo";

export type OsmMapProps = {
  lat: number;
  lng: number;
  zoom: number;
  title?: string | null;
  address?: string | null;
  autoOpen?: boolean;
};

/**
 * Keyless OpenStreetMap fallback (Leaflet). Used in local development, or when
 * the Google key is rejected for the current domain, so the map never errors out.
 */
export function OsmMap({ lat, lng, zoom, title, address, autoOpen }: OsmMapProps) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let map: any = null;

    (async () => {
      const L = (await import("leaflet")).default ?? (await import("leaflet"));
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !hostRef.current) return;

      map = L.map(hostRef.current, {
        center: [lat, lng],
        zoom,
        scrollWheelZoom: false,
        attributionControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      const icon = L.divIcon({
        className: "osm-pin",
        html: '<span class="osm-pin-dot"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const marker = L.marker([lat, lng], { icon, title: title || undefined }).addTo(map);
      marker.bindPopup(popupHtml({ t, lat, lng, title, address }), { maxWidth: 260 });
      if (autoOpen) marker.openPopup();
      setTimeout(() => map?.invalidateSize(), 60);
    })().catch(() => {});

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng, zoom, title, address, autoOpen, t]);

  return <div ref={hostRef} className="company-map-canvas" role="region" aria-label={t("company.map_title")} />;
}

export function popupHtml({
  t, lat, lng, title, address,
}: { t: (k: string) => string; lat: number; lng: number; title?: string | null; address?: string | null }) {
  const coords = `${formatCoordinate(lat)}, ${formatCoordinate(lng)}`;
  return `<div class="map-info">
    ${title ? `<strong class="map-info-title">${escapeHtml(title)}</strong>` : ""}
    ${address ? `<div class="map-info-address">${escapeHtml(address)}</div>` : ""}
    <div class="map-info-coords" dir="ltr">${escapeHtml(coords)}</div>
    <div class="map-info-actions">
      <a href="${escapeHtml(buildNeshanUrl(lat, lng))}" target="_blank" rel="noopener">${escapeHtml(t("company.open_neshan"))}</a>
      <a href="${escapeHtml(buildGoogleMapsDirectionsUrl(lat, lng))}" target="_blank" rel="noopener">${escapeHtml(t("company.open_gmaps"))}</a>
    </div>
  </div>`;
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export default OsmMap;
