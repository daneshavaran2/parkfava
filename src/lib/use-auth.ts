import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser } from "./auth.functions";

type SessionUser = Awaited<ReturnType<typeof getCurrentUser>>;

export function useAuth() {
  const [user, setUser] = useState<SessionUser>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getCurrentUser()
      .then((u) => {
        if (mounted) setUser(u);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const isAdmin = !!user?.roles.includes("admin");
  // `session` is kept as an alias of `user` purely so existing call sites
  // that only check truthiness ("is someone logged in?") keep working
  // without a rename — the new session model has no separate JWT/session
  // object distinct from the user record.
  return { session: user, user, isAdmin, loading };
}

// The "park-assets" storage policy grants `anon`/`authenticated` SELECT on
// this bucket's objects, so a plain public URL *should* work — and
// resolving it synchronously means it's available on the very first render,
// including SSR, with no signed-URL round trip. But whether Supabase
// actually serves that public URL also depends on the bucket's own
// "Public bucket" toggle, which is a separate setting outside these RLS
// policies (and outside version control) — nobody who only has this repo,
// without direct Supabase project access, can verify or flip it.
export function getAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return supabase.storage.from("park-assets").getPublicUrl(path).data.publicUrl;
}

const SIGNED_URL_CACHE = new Map<string, string>();

async function getSignedAssetUrl(path: string): Promise<string | null> {
  if (SIGNED_URL_CACHE.has(path)) return SIGNED_URL_CACHE.get(path)!;
  const { data } = await supabase.storage
    .from("park-assets")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (data?.signedUrl) SIGNED_URL_CACHE.set(path, data.signedUrl);
  return data?.signedUrl ?? null;
}

export function useAssetUrl(path: string | null | undefined) {
  const publicUrl = getAssetUrl(path);
  const [url, setUrl] = useState(publicUrl);

  useEffect(() => {
    setUrl(getAssetUrl(path));
  }, [path]);

  useEffect(() => {
    // If the bucket isn't actually public, the public URL 404s/403s at the
    // network level — `<img>` never fires a React error, so probe it with a
    // throwaway Image() and fall back to a signed URL (which works
    // regardless of the bucket's public flag, since it goes through the
    // RLS-checked signing endpoint instead of the public object endpoint).
    if (!url || path?.startsWith("http")) return;
    let active = true;
    const probe = new window.Image();
    probe.onerror = () => {
      if (!active || !path) return;
      getSignedAssetUrl(path).then((signed) => {
        if (active && signed) setUrl(signed);
      });
    };
    probe.src = url;
    return () => {
      active = false;
      probe.onerror = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return url;
}
