-- A news item can carry one video.
--
-- park_images already covers stills for a park; this is for the case where the
-- announcement itself is the footage — an opening, a demo, a site tour — and a
-- still frame would not carry it.
--
-- Stored the same way as every other upload: a path under UPLOAD_DIR served
-- back through /assets/$, not an embed URL. IF NOT EXISTS so re-running against
-- a database that already has the column is a no-op rather than an error.
ALTER TABLE park_news ADD COLUMN IF NOT EXISTS video_url text;
