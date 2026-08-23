-- Fars (Shiraz), East Azerbaijan (Tabriz), and Khuzestan (Ahvaz) are no
-- longer part of the bundled park list (see src/lib/fava/data.js) — remove
-- their seeded rows too. Companies previously assigned to one of these parks
-- keep existing (park_id is ON DELETE SET NULL, per 0004), they just become
-- unassigned; park_content/park_images/park_news cascade-delete with the park.
DELETE FROM parks WHERE park_id IN ('fars', 'eaz', 'khz');
