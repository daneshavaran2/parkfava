-- Trigger-only functions: revoke direct EXECUTE from clients
REVOKE ALL ON FUNCTION public.handle_first_user_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
-- has_role and is_company_owner MUST stay executable by authenticated (used inside RLS policies).
-- Ensure they remain granted (idempotent):
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_company_owner(text, uuid) TO authenticated, service_role;