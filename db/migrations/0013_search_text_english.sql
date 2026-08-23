-- Let the assistant find a company from an English question.
--
-- src/lib/assistant.functions.ts shortlists companies in Postgres with
-- `search_text LIKE '%term%'` before any ranking happens in JS, so a term that
-- is not in search_text cannot reach the ranking step at all. As defined in
-- 0004, the companies' search_text carried exactly one English column
-- (name_en) and the products' carried none — so "who makes fiber optic
-- modems" matched nothing, the shortlist came back empty, and the assistant
-- answered from general knowledge while the exhibition held the answer.
--
-- Now that every company has English content from its booklet form (0012),
-- fold the rest of the English columns in.
--
-- A generated column's expression cannot be altered, so each one is dropped
-- and re-added. That drops its trigram index with it; both are recreated
-- below. The translate() call is unchanged and must stay in sync with norm()
-- in src/lib/assistant/match.ts, which applies the same substitutions to the
-- user's question.

ALTER TABLE exhibition_companies DROP COLUMN IF EXISTS search_text;
ALTER TABLE exhibition_companies
  ADD COLUMN search_text text GENERATED ALWAYS AS (
    lower(translate(
      coalesce(name, '') || ' ' ||
      coalesce(name_en, '') || ' ' ||
      coalesce(tagline, '') || ' ' ||
      coalesce(tagline_en, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(city_en, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(description_en, '') || ' ' ||
      coalesce(intro, '') || ' ' ||
      coalesce(intro_en, '') || ' ' ||
      coalesce(founders, '') || ' ' ||
      coalesce(founders_en, '') || ' ' ||
      coalesce(knowledge_products_intro, '') || ' ' ||
      coalesce(knowledge_products_intro_en, '') || ' ' ||
      coalesce(export_potential, '') || ' ' ||
      coalesce(export_potential_en, ''),
      E'يك‌', E'یک '
    ))
  ) STORED;

ALTER TABLE exhibition_products DROP COLUMN IF EXISTS search_text;
ALTER TABLE exhibition_products
  ADD COLUMN search_text text GENERATED ALWAYS AS (
    lower(translate(
      coalesce(name, '') || ' ' ||
      coalesce(name_en, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(description_en, ''),
      E'يك‌', E'یک '
    ))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_exh_companies_search_trgm
  ON exhibition_companies USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_exh_products_search_trgm
  ON exhibition_products USING gin (search_text gin_trgm_ops);
