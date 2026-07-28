import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { escapeHtml, popupHtml } from "./OsmMap";

const LazyOsmMap = lazy(() => import("./OsmMap").then((m) => ({ default: m.OsmMap })));

const CALLBACK = "__favaGmapsReady";
let loaderPromise: Promise<void> | null = null;
let googleAuthFailed = false;

function isLocalHost() {
  if (typeof window === "undefined") return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
}

/**
 * Dev machines use a developer-supplied key (VITE_GOOGLE_MAPS_DEV_KEY) because the
 * Lovable-managed key is referrer-restricted to *.lovable.app / *.lovableproject.com.
 */
function resolveKey(): string | null {
  const devKey = import.meta.env.VITE_GOOGLE_MAPS_DEV_KEY as string | undefined;
  if (isLocalHost()) return devKey || null;
  return (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined) || devKey || null;
}

function loadMapsApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const w = window as any;
  if (w.google?.maps?.Map) return Promise.resolve();
  if (loaderPromise) return loaderPromise;

  const key = resolveKey();
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) return Promise.reject(new Error("missing browser key"));

  loaderPromise = new Promise<void>((resolve, reject) => {
    w[CALLBACK] = () => resolve();
    // Google calls this global when the key is rejected for this referrer.
    w.gm_authFailure = () => {
      googleAuthFailed = true;
      loaderPromise = null;
      reject(new Error("gm_authFailure"));
    };
    const s = document.createElement("script");
    const params = new URLSearchParams({ key, loading: "async", callback: CALLBACK });
    if (channel) params.set("channel", channel);
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.onerror = () => {
      loaderPromise = null;
      reject(new Error("script failed"));
    };
    document.head.appendChild(s);
  });
  return loaderPromise;
}

export type CompanyMapProps = {
  lat: number;
  lng: number;
  zoom?: number | null;
  title?: string | null;
  address?: string | null;
};

/** Zoom set in the admin panel wins; otherwise pick a sensible level from the data. */
function resolveZoom(zoom?: number | null, lat?: number, address?: string | null) {
  if (zoom && zoom > 0) return zoom;
  const decimals = String(lat ?? "").split(".")[1]?.length ?? 0;
  if (address && decimals >= 4) return 16; // precise street-level coordinates
  if (decimals >= 3) return 15;
  return 13; // approximate / city-level coordinates
}

/** Google map centred on the company's admin-set coordinates. Client-only. */
export function CompanyMap({ lat, lng, zoom, title, address }: CompanyMapProps) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const infoRef = useRef<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback">(
    () => (typeof window !== "undefined" && !resolveKey()) || googleAuthFailed ? "fallback" : "loading",
  );
  const effectiveZoom = resolveZoom(zoom, lat, address);

  // Deep-linked ?lat=&lng= that matches this company opens the marker details.
  const autoOpen = (() => {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    const qLat = Number(p.get("lat"));
    const qLng = Number(p.get("lng"));
    return Number.isFinite(qLat) && Number.isFinite(qLng) &&
      Math.abs(qLat - lat) < 1e-5 && Math.abs(qLng - lng) < 1e-5;
  })();

  useEffect(() => {
    if (state === "fallback") return;
    let cancelled = false;
    loadMapsApi()
      .then(() => {
        if (cancelled || !hostRef.current) return;
        const g = (window as any).google;
        const center = { lat, lng };
        if (!mapRef.current) {
          mapRef.current = new g.maps.Map(hostRef.current, {
            center,
            zoom: effectiveZoom,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            gestureHandling: "cooperative",
          });
        } else {
          // Pan instead of re-creating, so the map doesn't jump when data changes.
          mapRef.current.panTo(center);
          mapRef.current.setZoom(effectiveZoom);
        }
        if (!markerRef.current) {
          markerRef.current = new g.maps.Marker({ position: center, map: mapRef.current });
        } else {
          markerRef.current.setPosition(center);
        }
        markerRef.current.setTitle(title || "");

        infoRef.current?.close();
        infoRef.current = new g.maps.InfoWindow({
          content: `<div style="font-family:inherit;max-width:250px;line-height:1.8">${
            popupHtml({ t, lat, lng, title, address })
          }</div>`,
        });
        g.maps.event.clearInstanceListeners(markerRef.current);
        markerRef.current.addListener("click", () =>
          infoRef.current.open({ map: mapRef.current, anchor: markerRef.current }));
        if (autoOpen) infoRef.current.open({ map: mapRef.current, anchor: markerRef.current });

        setState("ready");
      })
      .catch(() => {
        // Any key/referrer problem degrades to the keyless OSM map instead of an error.
        if (!cancelled) setState("fallback");
      });
    return () => { cancelled = true; };
  }, [lat, lng, effectiveZoom, title, address, autoOpen, state, t]);

  return (
    <div className="company-map" data-testid="company-map" data-state={state}>
      {state === "fallback" ? (
        <Suspense fallback={<div className="company-map-canvas company-map-skeleton" />}>
          <LazyOsmMap lat={lat} lng={lng} zoom={effectiveZoom} title={title} address={address} autoOpen={autoOpen} />
        </Suspense>
      ) : (
        <div ref={hostRef} className="company-map-canvas" aria-label={t("company.map_title")} role="region" />
      )}
      {state === "loading" && <div className="company-map-overlay">{t("company.map_loading")}</div>}
    </div>
  );
}

export { escapeHtml };
export default CompanyMap;
