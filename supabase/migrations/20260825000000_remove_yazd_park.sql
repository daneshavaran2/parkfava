-- Yazd is no longer part of the bundled park list (see src/lib/fava/data.js)
-- — remove its seeded row too, same pattern as 0011's Fars/East Azerbaijan/
-- Khuzestan removal. No exhibition_companies are assigned to this park
-- (verified before writing this migration), so there's nothing to reassign;
-- park_content/park_images/park_news cascade-delete with the park.
DELETE FROM parks WHERE park_id = 'yazd';
