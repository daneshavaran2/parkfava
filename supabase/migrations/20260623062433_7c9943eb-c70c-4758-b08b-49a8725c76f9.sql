
ALTER TABLE public.exhibition_companies
  ADD COLUMN IF NOT EXISTS founded_at date,
  ADD COLUMN IF NOT EXISTS intro text,
  ADD COLUMN IF NOT EXISTS founders text,
  ADD COLUMN IF NOT EXISTS export_potential text,
  ADD COLUMN IF NOT EXISTS headcount integer,
  ADD COLUMN IF NOT EXISTS knowledge_products_intro text,
  ADD COLUMN IF NOT EXISTS linkedin_url text;
