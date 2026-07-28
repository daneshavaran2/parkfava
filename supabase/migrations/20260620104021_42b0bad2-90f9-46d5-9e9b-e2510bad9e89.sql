
ALTER TABLE public.exhibition_companies
  ADD COLUMN IF NOT EXISTS catalog_url text,
  ADD COLUMN IF NOT EXISTS video_url text;

CREATE TABLE IF NOT EXISTS public.exhibition_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES public.exhibition_companies(company_id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  image_url text,
  video_url text,
  link_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.exhibition_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exhibition_products TO authenticated;
GRANT ALL ON public.exhibition_products TO service_role;

ALTER TABLE public.exhibition_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exh_products public read" ON public.exhibition_products FOR SELECT USING (true);
CREATE POLICY "exh_products admin insert" ON public.exhibition_products FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "exh_products admin update" ON public.exhibition_products FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "exh_products admin delete" ON public.exhibition_products FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_exh_products_updated BEFORE UPDATE ON public.exhibition_products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
