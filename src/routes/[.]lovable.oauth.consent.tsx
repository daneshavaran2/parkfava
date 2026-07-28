import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

type OAuthClient = { name?: string; client_name?: string; redirect_uri?: string };
type AuthorizationDetails = {
  client?: OAuthClient;
  scope?: string;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};

// Narrow typed wrapper around the beta supabase.auth.oauth namespace.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};
const authOAuth = (): OAuthApi => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage,
  // which is absent on the SSR pass.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await authOAuth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main style={{ maxWidth: 460, margin: "60px auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Authorization error</h1>
      <p style={{ color: "var(--ink-soft)" }}>{String((error as Error)?.message ?? error)}</p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.client_name ?? details?.client?.name ?? "an app";
  const scopes = details?.scopes ?? (details?.scope ? details.scope.split(/\s+/).filter(Boolean) : []);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = authOAuth();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main style={{ maxWidth: 480, margin: "60px auto", padding: 0 }}>
      <div className="panel" style={{ padding: 28 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>
          {t("oauth.title", { client: clientName, defaultValue: `Connect ${clientName}` })}
        </h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 6 }}>
          {t("oauth.summary", {
            client: clientName,
            defaultValue: `${clientName} will be able to use this app as you.`,
          })}
        </p>
        {details?.client?.redirect_uri && (
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12, wordBreak: "break-all" }}>
            {t("oauth.redirect_label", { defaultValue: "Redirect" })}: {details.client.redirect_uri}
          </p>
        )}
        {scopes.length > 0 && (
          <ul style={{ fontSize: 13, marginBottom: 14, paddingInlineStart: 18 }}>
            {scopes.map((s: string) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 18 }}>
          {t("oauth.boundary", {
            defaultValue: "This does not bypass this app's permissions or backend policies.",
          })}
        </p>
        {error && (
          <div role="alert" style={{ color: "#ff7676", fontSize: 13, marginBottom: 10 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-primary"
            onClick={() => decide(true)}
            disabled={busy}
            style={{ flex: 1 }}
          >
            {t("oauth.approve", { defaultValue: "Approve" })}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => decide(false)}
            disabled={busy}
            style={{ flex: 1 }}
          >
            {t("oauth.deny", { defaultValue: "Deny" })}
          </button>
        </div>
      </div>
    </main>
  );
}
