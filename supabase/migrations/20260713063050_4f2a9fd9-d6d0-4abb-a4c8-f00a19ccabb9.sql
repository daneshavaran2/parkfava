ALTER TABLE public.exhibition_companies
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS map_zoom smallint DEFAULT 16;