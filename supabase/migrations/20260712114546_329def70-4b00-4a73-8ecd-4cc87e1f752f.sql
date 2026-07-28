CREATE INDEX IF NOT EXISTS idx_exhibition_companies_park_id ON public.exhibition_companies(park_id);
CREATE INDEX IF NOT EXISTS idx_exhibition_companies_status ON public.exhibition_companies(status);
CREATE INDEX IF NOT EXISTS idx_exhibition_products_company_id ON public.exhibition_products(company_id);
CREATE INDEX IF NOT EXISTS idx_exhibition_images_company_id ON public.exhibition_images(company_id);
CREATE INDEX IF NOT EXISTS idx_parks_active_sort ON public.parks(is_active, sort_order);

DROP TRIGGER IF EXISTS trg_parks_touch ON public.parks;
CREATE TRIGGER trg_parks_touch BEFORE UPDATE ON public.parks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();