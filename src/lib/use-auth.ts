import { useEffect, useState } from "react";
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

// Local disk storage is always served by our own /assets/$ route (see
// src/routes/assets.$.ts) — deterministically public, no bucket-visibility
// ambiguity or signed-URL fallback needed like the old Supabase Storage
// setup required.
export function getAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `/assets/${path}`;
}

export function useAssetUrl(path: string | null | undefined) {
  return getAssetUrl(path);
}
