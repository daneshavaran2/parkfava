-- 1) Add company_owner role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'company_owner';

-- 2) Rewrite trigger: no auto-'user' role; only bootstrap first admin
CREATE OR REPLACE FUNCTION public.handle_first_user_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Lock down user_roles: only admins can write
DROP POLICY IF EXISTS "Admins manage user roles" ON public.user_roles;
CREATE POLICY "Admins manage user roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) Remove self-registration of companies: drop owner INSERT policy.
--    Only admins may create companies now (existing admin INSERT policy remains).
DROP POLICY IF EXISTS "exh_companies owner insert" ON public.exhibition_companies;