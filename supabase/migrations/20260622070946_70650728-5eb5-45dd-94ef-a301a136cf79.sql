
CREATE TABLE public.company_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('exhibition','park')),
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('logo','gallery_image','catalog','form_fa','form_en','document','other')),
  title TEXT,
  description TEXT,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_attachments_owner ON public.company_attachments (owner_type, owner_id, kind, sort_order);

GRANT SELECT ON public.company_attachments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_attachments TO authenticated;
GRANT ALL ON public.company_attachments TO service_role;

ALTER TABLE public.company_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments public read" ON public.company_attachments
  FOR SELECT USING (is_active = true);

CREATE POLICY "attachments admin read all" ON public.company_attachments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "attachments admin insert" ON public.company_attachments
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "attachments admin update" ON public.company_attachments
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "attachments admin delete" ON public.company_attachments
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_company_attachments_updated_at
  BEFORE UPDATE ON public.company_attachments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
