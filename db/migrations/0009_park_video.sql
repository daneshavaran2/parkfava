-- A park can carry one showcase video (the park's own film), shown on the park
-- dashboard just above the resident-companies list.
--
-- Stored like every other upload: a path under UPLOAD_DIR served back through
-- /assets/$, not an embed URL.
ALTER TABLE park_content ADD COLUMN IF NOT EXISTS video_url text;
