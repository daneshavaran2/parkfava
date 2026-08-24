-- companies_hint was a manually-entered guess, seeded once in 0010 and never
-- kept in sync with exhibition_companies. It drifted badly (e.g. Khorasan
-- Razavi read 312 while the park actually had 14 real companies) and Alborz,
-- which was never seeded at all, read 0 despite having real companies.
--
-- src/lib/parks.functions.ts now computes this as a live COUNT of approved,
-- active companies per park instead of reading a stored column, so the
-- number can no longer drift from reality. The column is dropped so nothing
-- can write a stale value back into it.

ALTER TABLE parks DROP COLUMN IF EXISTS companies_hint;

CREATE INDEX IF NOT EXISTS idx_exh_companies_park_status_active
  ON exhibition_companies (park_id, status, is_active);
