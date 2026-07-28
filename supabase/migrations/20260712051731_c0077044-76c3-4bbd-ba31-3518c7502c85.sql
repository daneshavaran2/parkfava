
-- 1) Columns
ALTER TABLE public.exhibition_companies
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_note text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='exhibition_companies_status_check') THEN
    ALTER TABLE public.exhibition_companies
      ADD CONSTRAINT exhibition_companies_status_check
      CHECK (status IN ('draft','pending','approved','rejected'));
  END IF;
END $$;

-- Existing rows: mark as approved so they keep showing
UPDATE public.exhibition_companies SET status='approved' WHERE status IS NULL OR status='draft';

CREATE INDEX IF NOT EXISTS exhibition_companies_owner_idx ON public.exhibition_companies(owner_user_id);
CREATE INDEX IF NOT EXISTS exhibition_companies_status_idx ON public.exhibition_companies(status);

-- 2) Helper: is user the owner of a company?
CREATE OR REPLACE FUNCTION public.is_company_owner(_company_id text, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.exhibition_companies
    WHERE company_id = _company_id AND owner_user_id = _user_id
  )
$$;

-- 3) Rewrite policies on exhibition_companies
DROP POLICY IF EXISTS "exh_companies public read" ON public.exhibition_companies;
DROP POLICY IF EXISTS "exh_companies admin insert" ON public.exhibition_companies;
DROP POLICY IF EXISTS "exh_companies admin update" ON public.exhibition_companies;
DROP POLICY IF EXISTS "exh_companies admin delete" ON public.exhibition_companies;

CREATE POLICY "exh_companies public read"
  ON public.exhibition_companies FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' AND is_active = true);

CREATE POLICY "exh_companies owner read"
  ON public.exhibition_companies FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "exh_companies admin read"
  ON public.exhibition_companies FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "exh_companies owner insert"
  ON public.exhibition_companies FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    AND status IN ('draft','pending')
    AND is_active = false
  );

CREATE POLICY "exh_companies admin insert"
  ON public.exhibition_companies FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "exh_companies owner update"
  ON public.exhibition_companies FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid() AND status IN ('draft','pending','rejected'))
  WITH CHECK (
    owner_user_id = auth.uid()
    AND status IN ('draft','pending')
    AND is_active = false
  );

CREATE POLICY "exh_companies admin update"
  ON public.exhibition_companies FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "exh_companies admin delete"
  ON public.exhibition_companies FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "exh_companies owner delete"
  ON public.exhibition_companies FOR DELETE
  TO authenticated
  USING (owner_user_id = auth.uid() AND status IN ('draft','rejected'));

-- 4) Rewrite policies on exhibition_images
DROP POLICY IF EXISTS "exh_images public read" ON public.exhibition_images;
DROP POLICY IF EXISTS "exh_images admin insert" ON public.exhibition_images;
DROP POLICY IF EXISTS "exh_images admin update" ON public.exhibition_images;
DROP POLICY IF EXISTS "exh_images admin delete" ON public.exhibition_images;

CREATE POLICY "exh_images public read"
  ON public.exhibition_images FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exhibition_companies c
      WHERE c.company_id = exhibition_images.company_id
        AND c.status = 'approved' AND c.is_active = true
    )
  );

CREATE POLICY "exh_images owner all"
  ON public.exhibition_images FOR ALL
  TO authenticated
  USING (is_company_owner(company_id, auth.uid()))
  WITH CHECK (is_company_owner(company_id, auth.uid()));

CREATE POLICY "exh_images admin all"
  ON public.exhibition_images FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5) Rewrite policies on exhibition_products
DROP POLICY IF EXISTS "exh_products public read" ON public.exhibition_products;
DROP POLICY IF EXISTS "exh_products admin insert" ON public.exhibition_products;
DROP POLICY IF EXISTS "exh_products admin update" ON public.exhibition_products;
DROP POLICY IF EXISTS "exh_products admin delete" ON public.exhibition_products;

CREATE POLICY "exh_products public read"
  ON public.exhibition_products FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exhibition_companies c
      WHERE c.company_id = exhibition_products.company_id
        AND c.status = 'approved' AND c.is_active = true
    )
  );

CREATE POLICY "exh_products owner all"
  ON public.exhibition_products FOR ALL
  TO authenticated
  USING (is_company_owner(company_id, auth.uid()))
  WITH CHECK (is_company_owner(company_id, auth.uid()));

CREATE POLICY "exh_products admin all"
  ON public.exhibition_products FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
