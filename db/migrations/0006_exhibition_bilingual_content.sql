-- English variants for every visitor-facing text field in the exhibition.
ALTER TABLE exhibition_companies
  ADD COLUMN IF NOT EXISTS tagline_en text,
  ADD COLUMN IF NOT EXISTS city_en text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS address_en text,
  ADD COLUMN IF NOT EXISTS intro_en text,
  ADD COLUMN IF NOT EXISTS founders_en text,
  ADD COLUMN IF NOT EXISTS export_potential_en text,
  ADD COLUMN IF NOT EXISTS knowledge_products_intro_en text;

ALTER TABLE exhibition_products
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS description_en text;

ALTER TABLE exhibition_images
  ADD COLUMN IF NOT EXISTS caption_en text;
