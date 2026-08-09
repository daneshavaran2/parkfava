-- Scale + referential-integrity pass over the schema.
--
-- Three groups of changes:
--   1. Searchable, indexed text so the assistant can filter in Postgres
--      instead of loading every company/product into Node on each question.
--   2. The foreign keys that were missing relative to the rest of the schema.
--   3. A generic rate-limit ledger, so a public endpoint that spends money
--      (the OpenRouter-backed assistant) can be throttled per client.

-- ===================== 1. SEARCH =====================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Persian text arrives with inconsistent spellings: Arabic yeh/kaf (ي/ك)
-- instead of Persian (ی/ک), and ZWNJ inside compound words. Normalizing
-- once here — in a STORED generated column — means the search index and the
-- query see the same canonical form, and matches the exact same normalization
-- src/lib/assistant/match.ts applies to the user's question.
--   U+064A -> U+06CC (yeh), U+0643 -> U+06A9 (kaf), U+200C -> space (ZWNJ)
ALTER TABLE exhibition_companies
  ADD COLUMN search_text text GENERATED ALWAYS AS (
    lower(translate(
      coalesce(name, '') || ' ' ||
      coalesce(name_en, '') || ' ' ||
      coalesce(tagline, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(intro, '') || ' ' ||
      coalesce(founders, '') || ' ' ||
      coalesce(knowledge_products_intro, '') || ' ' ||
      coalesce(export_potential, ''),
      E'يك‌', E'یک '
    ))
  ) STORED;

ALTER TABLE exhibition_products
  ADD COLUMN search_text text GENERATED ALWAYS AS (
    lower(translate(
      coalesce(name, '') || ' ' || coalesce(description, ''),
      E'يك‌', E'یک '
    ))
  ) STORED;

ALTER TABLE parks
  ADD COLUMN search_text text GENERATED ALWAYS AS (
    lower(translate(
      coalesce(name, '') || ' ' ||
      coalesce(name_en, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(province, ''),
      E'يك‌', E'یک '
    ))
  ) STORED;

-- Trigram GIN indexes make `search_text LIKE '%term%'` an index scan rather
-- than a sequential scan. (Terms shorter than 3 chars can't form a trigram
-- and still fall back to a scan — correct, just not accelerated.)
CREATE INDEX idx_exh_companies_search_trgm ON exhibition_companies USING gin (search_text gin_trgm_ops);
CREATE INDEX idx_exh_products_search_trgm ON exhibition_products USING gin (search_text gin_trgm_ops);
CREATE INDEX idx_parks_search_trgm ON parks USING gin (search_text gin_trgm_ops);

-- The hot public read is `status='approved' AND is_active=true ORDER BY
-- sort_order` — one composite index serves the filter and the sort together,
-- where the existing single-column status index left the sort to be done in
-- memory.
CREATE INDEX idx_exh_companies_public_listing
  ON exhibition_companies (status, is_active, sort_order);

-- ===================== 2. REFERENTIAL INTEGRITY =====================

-- Added NOT VALID: the constraint is enforced for every future insert/update
-- immediately, but existing rows are not re-checked, so this migration can't
-- fail (or destroy data) on a production table that already contains orphans.
-- Run `ALTER TABLE ... VALIDATE CONSTRAINT ...` later, after cleaning up any
-- orphaned rows, to also close the historical gap.
ALTER TABLE park_images
  ADD CONSTRAINT park_images_park_id_fkey
  FOREIGN KEY (park_id) REFERENCES parks(park_id) ON DELETE CASCADE NOT VALID;

ALTER TABLE park_news
  ADD CONSTRAINT park_news_park_id_fkey
  FOREIGN KEY (park_id) REFERENCES parks(park_id) ON DELETE CASCADE NOT VALID;

-- SET NULL rather than CASCADE: deleting a park must not delete the companies
-- that sat in it — they just become unassigned.
ALTER TABLE exhibition_companies
  ADD CONSTRAINT exhibition_companies_park_id_fkey
  FOREIGN KEY (park_id) REFERENCES parks(park_id) ON DELETE SET NULL NOT VALID;

ALTER TABLE exhibition_companies
  ADD CONSTRAINT exhibition_companies_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL NOT VALID;

-- ===================== 3. RATE LIMITING =====================

-- One row per accepted request against a throttled endpoint. Kept in
-- Postgres rather than process memory so the limit still holds when the app
-- runs as multiple worker processes (see server/cluster.mjs) and survives a
-- restart — an in-memory counter would reset on every deploy, which is
-- exactly when an abusive client would get a free pass.
CREATE TABLE rate_limit_hits (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rate_limit_hits_bucket_time ON rate_limit_hits (bucket, created_at DESC);
