import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Nav, Footer } from "../components/fava/views";
import { Assistant } from "../components/fava/Assistant";
import { CircuitCanvas, installRobotPointer } from "../components/fava/primitives";
import { ClientOnly } from "../components/fava/ClientOnly";
import { LanguageProvider } from "../i18n/LanguageProvider";
import { useTranslation } from "react-i18next";

// Kick off the FAVA vendor bundle as soon as the root module is evaluated on
// the client, so the loading fallback is minimized on first paint.
if (typeof window !== "undefined") {
  import("@/lib/fava/load").then((m) => m.loadFavaVendor()).catch(() => {});
}

function NotFoundComponent() {
  const { t } = useTranslation();
  return (
    <div className="view"><div className="shell">
      <div className="empty" style={{ marginTop: 80 }}>
        <h1 className="h1" style={{ fontSize: 56 }}>{t("errors.not_found_title")}</h1>
        <p className="lead" style={{ marginTop: 12 }}>{t("errors.not_found_lead")}</p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 18, display: "inline-flex" }}>{t("common.back_home")}</Link>
      </div>
    </div></div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { t } = useTranslation();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="view"><div className="shell">
      <div className="empty" style={{ marginTop: 80 }}>
        <h2 className="h2">{t("errors.page_failed")}</h2>
        <p className="lead" style={{ marginTop: 8 }}>{t("errors.page_failed_lead")}</p>
        <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => { router.invalidate(); reset(); }}>{t("common.try_again")}</button>
          <Link to="/" className="btn btn-ghost">{t("nav.home")}</Link>
        </div>
      </div>
    </div></div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "شبکه فناوری فاوا — FAVA Tech-Park Network" },
      { name: "description", content: "نمایشگاه مجازی هوشمند پارک‌های علم و فناوری ایران؛ شرکت‌ها، محصولات، نقشه و دستیار هوشمند." },
      { name: "author", content: "FAVA" },
      { property: "og:title", content: "شبکه فناوری فاوا — FAVA Tech-Park Network" },
      { property: "og:description", content: "نمایشگاه مجازی هوشمند پارک‌های علم و فناوری ایران؛ شرکت‌ها، محصولات، نقشه و دستیار هوشمند." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "شبکه فناوری فاوا — FAVA Tech-Park Network" },
      { name: "twitter:description", content: "نمایشگاه مجازی هوشمند پارک‌های علم و فناوری ایران؛ شرکت‌ها، محصولات، نقشه و دستیار هوشمند." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/eec1e678-a18d-40d2-9c4f-c675e090b12b" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/eec1e678-a18d-40d2-9c4f-c675e090b12b" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://cdn.jsdelivr.net", crossOrigin: "anonymous" },
      // Preload the two Shabnam cuts used on first paint (regular + bold).
      {
        rel: "preload", as: "font", type: "font/woff2", crossOrigin: "anonymous",
        href: "https://cdn.jsdelivr.net/gh/rastikerdar/shabnam-font@v5.0.1/dist/Shabnam.woff2",
      },
      {
        rel: "preload", as: "font", type: "font/woff2", crossOrigin: "anonymous",
        href: "https://cdn.jsdelivr.net/gh/rastikerdar/shabnam-font@v5.0.1/dist/Shabnam-Bold.woff2",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body data-density="regular" data-theme="light" data-direction="colorful">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const path = router.state.location.pathname;
  const isKiosk = path.startsWith("/kiosk");
  const isStandalone = path.startsWith("/hero");
  const isParksFull = path === "/parks" || path.startsWith("/parks/");

  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    installRobotPointer();
    // Vendor is also kicked off at module scope below — this awaits the same
    // in-flight promise if it's still loading, and is a cheap no-op otherwise.
    import("@/lib/fava/load").then((m) => m.loadFavaVendor()).catch(() => {});
    try {
      const saved = localStorage.getItem("fava-theme") as "dark" | "light" | null;
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.body.dataset.theme = theme;
    try { localStorage.setItem("fava-theme", theme); } catch {}
  }, [theme]);

  const view =
    path === "/" ? "home" :
    path.startsWith("/exhibition") ? "exhibition" :
    path.startsWith("/parks") ? "parks" :
    path.startsWith("/categories") ? "categories" :
    path.startsWith("/company") ? "company" :
    path.startsWith("/about") ? "about" : "home";

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
      {isKiosk || isStandalone ? (
        <Outlet />
      ) : (
        <>
          <ClientOnly><div className="bg-wash" /></ClientOnly>
          <Nav view={view} query={query} setQuery={setQuery}
            theme={theme} toggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} />
          <div className={"page-shell" + (isParksFull ? " page-shell-full" : "")}>
            <Outlet />
          </div>
          {!isParksFull && <Footer />}
          <ClientOnly><Assistant /></ClientOnly>
        </>
      )}
      </LanguageProvider>
    </QueryClientProvider>
  );
}

