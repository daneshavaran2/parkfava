-- Corrects two data-quality bugs from the booklet transcription applied in
-- 0012_booklet_authoritative_content.sql (already live, so this is a
-- forward-fixing UPDATE rather than an edit to that migration).
--
-- 1. The booklet form's own field hints -- "(حداکثر N کلمه)" / "(Maximum N
--    words)" -- got transcribed in as part of the actual answer, wherever a
--    subsection (intro, features, tech specs, ...) was copied along with its
--    hint. Strips every occurrence, not just a leading one; tolerates the
--    one entry missing its closing paren.
UPDATE exhibition_companies SET
  description    = regexp_replace(description,    '\(حداکثر\s*[0-9]+\s*کلمه\)?\s*\n?', '', 'g'),
  description_en = regexp_replace(description_en, '\(Maximum\s*[0-9]+\s*words\)?\s*\n?', '', 'g'),
  intro           = regexp_replace(intro,           '\(حداکثر\s*[0-9]+\s*کلمه\)?\s*\n?', '', 'g'),
  intro_en        = regexp_replace(intro_en,        '\(Maximum\s*[0-9]+\s*words\)?\s*\n?', '', 'g'),
  updated_at = now()
WHERE description    ~ '\(حداکثر\s*[0-9]+\s*کلمه\)?'
   OR description_en ~ '\(Maximum\s*[0-9]+\s*words\)?'
   OR intro           ~ '\(حداکثر\s*[0-9]+\s*کلمه\)?'
   OR intro_en        ~ '\(Maximum\s*[0-9]+\s*words\)?';

UPDATE exhibition_products SET
  description    = regexp_replace(description,    '\(حداکثر\s*[0-9]+\s*کلمه\)?\s*\n?', '', 'g'),
  description_en = regexp_replace(description_en, '\(Maximum\s*[0-9]+\s*words\)?\s*\n?', '', 'g'),
  updated_at = now()
WHERE description    ~ '\(حداکثر\s*[0-9]+\s*کلمه\)?'
   OR description_en ~ '\(Maximum\s*[0-9]+\s*words\)?';

-- 2. For 3 companies, `tagline_en` (a one-line subtitle shown under the
--    company name) didn't just get the field hint -- it absorbed the entire
--    rest of that company's transcription after it (founders, headcount,
--    full intro, every product). The real values for all of that already
--    live in their own proper columns, so the fix is to cut the duplicated
--    tail, not merge or re-derive anything. Detected the same way it was
--    found: the tell-tale "\nFounders" boundary plus an implausible length
--    for what should be a one-line tagline.
UPDATE exhibition_companies SET
  tagline_en = left(tagline_en, position(E'\nFounders' in tagline_en) - 1),
  updated_at = now()
WHERE length(tagline_en) > 2000
  AND position(E'\nFounders' in tagline_en) > 0;
