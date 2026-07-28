
-- exhibition_companies
CREATE TABLE public.exhibition_companies (
  company_id text PRIMARY KEY,
  name text NOT NULL,
  tagline text,
  category text,
  park_id text,
  city text,
  description text,
  logo_url text,
  website text,
  phone text,
  email text,
  address text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exhibition_companies TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exhibition_companies TO authenticated;
GRANT ALL ON public.exhibition_companies TO service_role;
ALTER TABLE public.exhibition_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exh_companies public read" ON public.exhibition_companies FOR SELECT USING (true);
CREATE POLICY "exh_companies admin insert" ON public.exhibition_companies FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "exh_companies admin update" ON public.exhibition_companies FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "exh_companies admin delete" ON public.exhibition_companies FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- exhibition_images
CREATE TABLE public.exhibition_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES public.exhibition_companies(company_id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exhibition_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exhibition_images TO authenticated;
GRANT ALL ON public.exhibition_images TO service_role;
ALTER TABLE public.exhibition_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exh_images public read" ON public.exhibition_images FOR SELECT USING (true);
CREATE POLICY "exh_images admin insert" ON public.exhibition_images FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "exh_images admin update" ON public.exhibition_images FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "exh_images admin delete" ON public.exhibition_images FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- about_sections
CREATE TABLE public.about_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL,
  title text,
  body text,
  image_url text,
  video_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.about_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.about_sections TO authenticated;
GRANT ALL ON public.about_sections TO service_role;
ALTER TABLE public.about_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "about public read" ON public.about_sections FOR SELECT USING (true);
CREATE POLICY "about admin insert" ON public.about_sections FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "about admin update" ON public.about_sections FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "about admin delete" ON public.about_sections FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger reused
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_exh_companies_updated BEFORE UPDATE ON public.exhibition_companies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_about_updated BEFORE UPDATE ON public.about_sections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
