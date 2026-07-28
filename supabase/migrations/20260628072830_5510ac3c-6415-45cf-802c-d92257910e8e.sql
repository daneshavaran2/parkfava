ALTER TABLE public.exhibition_companies
  ADD COLUMN IF NOT EXISTS headcount_full_time integer,
  ADD COLUMN IF NOT EXISTS headcount_part_time integer;

ALTER TABLE public.about_sections
  ADD COLUMN IF NOT EXISTS video_url_2 text;