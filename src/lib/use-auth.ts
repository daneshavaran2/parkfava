import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  return { session, user, isAdmin, loading };
}

// `park-assets` is a public-read bucket (see the "park-assets public read"
// storage policy), so the URL is a deterministic string — no signed-URL
// round trip needed. Resolving it synchronously means it's available on the
// very first render, including SSR, instead of appearing only after a
// client-side effect resolves (which produced a blank/placeholder flash and
// an SSR/CSR hydration mismatch on every image).
export function getAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return supabase.storage.from("park-assets").getPublicUrl(path).data.publicUrl;
}

export function useAssetUrl(path: string | null | undefined) {
  return getAssetUrl(path);
}
