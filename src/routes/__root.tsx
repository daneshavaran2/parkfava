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
import { KioskIdleGuard } from "../components/fava/KioskIdleGuard";
import { CircuitCanvas, installRobotPointer } from "../components/fava/primitives";
import { ClientOnly } from "../components/fava/ClientOnly";
import { LanguageProvider } from "../i18n/LanguageProvider";
import { loadStoredTheme, setTheme as setThemeStore, subscribeTheme, THEME_STORAGE_KEY } from "../lib/theme";
import { useTranslation } from "react-i18next";
import { tHead } from "@/i18n/head";
import { currentLang } from "@/i18n/LanguageProvider";

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
      { title: tHead("meta.site_title") },
      { name: "description", content: tHead("meta.site_desc") },
      { name: "author", content: "ICT PARK" },
      { property: "og:title", content: tHead("meta.site_title") },
      { property: "og:description", content: tHead("meta.site_desc") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: tHead("meta.site_title") },
      { name: "twitter:description", content: tHead("meta.site_desc") },
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
  // Server-rendered from the request's own cookie. Hardcoding fa/rtl here
  // served every English visitor a document declared Persian and laid out
  // right-to-left until hydration ran and LangDomSync corrected it — a
  // visible flip on each load, and the only value crawlers and no-JS
  // clients ever saw.
  const lang = currentLang();
  return (
    <html lang={lang} dir={lang === "en" ? "ltr" : "rtl"} suppressHydrationWarning>
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
  // The login page is a full-screen scene of its own — nav, footer, assistant
  // and page shell would all sit on top of it.
  const isStandalone = path.startsWith("/hero") || path === "/auth";
  const isParksFull = path === "/parks" || path.startsWith("/parks/");
  // The AI assistant is a data-entry aid for admins and company owners
  // filling out their profile/products — it has no role on public pages
  // (home, company profiles, exhibition, parks…), so it only mounts on the
  // admin panel and the company self-service screens.
  const showAssistant =
    path.startsWith("/admin") || path.startsWith("/my-company") || path.startsWith("/register-company");

  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    installRobotPointer();
    // The FAVA vendor bundle (~160 KB + a parks fetch) is NOT kicked off
    // here — every view that actually renders FAVA-backed content already
    // calls useFavaReady() itself on mount (see ClientOnly.tsx), which loads
    // it lazily. Loading it unconditionally for every route, including ones
    // that never touch window.FAVA (admin, my-company, register-company),
    // used to cost every visitor that fetch + bundle on first paint for
    // nothing.
    setTheme(loadStoredTheme());
    // Pages outside this layout (the login scene) toggle the theme through the
    // shared store rather than through the nav.
    return subscribeTheme(setTheme);
  }, []);
  useEffect(() => {
    document.body.dataset.theme = theme;
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
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
      <KioskIdleGuard />
      {isKiosk || isStandalone ? (
        <Outlet />
      ) : (
        <>
          <ClientOnly><div className="bg-wash" /></ClientOnly>
          <Nav view={view} query={query} setQuery={setQuery}
            theme={theme} toggleTheme={() => setThemeStore(theme === "dark" ? "light" : "dark")} />
          <div className={"page-shell" + (isParksFull ? " page-shell-full" : "")}>
            <Outlet />
          </div>
          {!isParksFull && <Footer />}
          {showAssistant && <ClientOnly><Assistant /></ClientOnly>}
        </>
      )}
      </LanguageProvider>
    </QueryClientProvider>
  );
}

