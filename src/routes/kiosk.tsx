import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Home } from "@/components/fava/views";
import { tHead } from "@/i18n/head";

export const Route = createFileRoute("/kiosk")({
  head: () => ({ meta: [{ title: tHead("meta.home_title") }] }),
  component: KioskPage,
});

// A long-lived cache scoped to kiosk mode only — the device loads companies
// and images once when it connects, then reuses that instead of refetching
// on every idle-timeout reset back to this screen (see KioskIdleGuard).
// A nested QueryClientProvider here shadows the app-wide one for this
// subtree only, so the rest of the site keeps its normal fresh-data
// behavior. Uploaded images are already served with a long immutable
// Cache-Control header (see src/routes/assets.$.ts), so no change is
// needed there — this only affects company/product data fetches.
const kioskQueryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30 * 60 * 1000, gcTime: 60 * 60 * 1000 },
  },
});

function KioskPage() {
  useEffect(() => {
    try {
      sessionStorage.setItem("favaKioskMode", "1");
    } catch {}
  }, []);
  return (
    <QueryClientProvider client={kioskQueryClient}>
      <Home />
    </QueryClientProvider>
  );
}
