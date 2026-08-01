-- Optional English name for companies and parks, so the public site can
-- show a translated name when the visitor switches the language to
-- English instead of always falling back to the Persian name. Nullable:
-- existing rows without an English name keep rendering the Persian name
-- (see pickName() in src/components/fava/primitives.tsx).
ALTER TABLE public.exhibition_companies ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.parks ADD COLUMN IF NOT EXISTS name_en text;
