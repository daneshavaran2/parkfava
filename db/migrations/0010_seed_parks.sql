-- The park list used to live only in the bundled vendor data (src/lib/fava/data.js),
-- which meant the admin panel had nothing to edit and the per-province numbers
-- (resident companies / jobs / hectares) could not be changed without a code
-- change. Seed the parks table with today's values so the admin panel is
-- populated on a fresh deploy, and add the bilingual location columns the UI
-- already reads.
--
-- ON CONFLICT DO NOTHING: re-running never overwrites numbers an admin edited.

ALTER TABLE parks ADD COLUMN IF NOT EXISTS province_en text;
ALTER TABLE parks ADD COLUMN IF NOT EXISTS city_en text;

INSERT INTO parks (park_id, name, name_en, province, province_en, city, city_en,
                   mx, my, color, companies_hint, jobs, area, is_active, sort_order)
VALUES
  ('razavi',  'پارک علم و فناوری خراسان رضوی', 'Khorasan Razavi Science and Technology Park', 'خراسان رضوی', 'Khorasan Razavi', 'مشهد',  'Mashhad', 78, 30, 'blue',  312, 9800,  48, true, 1),
  ('semnan',  'پارک علم و فناوری سمنان',        'Semnan Science and Technology Park',          'سمنان',        'Semnan',          'سمنان', 'Semnan',  56, 41, 'gold',  96,  2400,  21, true, 2),
  ('mazand',  'پارک علم و فناوری مازندران',     'Mazandaran Science and Technology Park',      'مازندران',     'Mazandaran',      'ساری',  'Sari',    52, 26, 'green', 128, 3650,  27, true, 3),
  ('tehran',  'پارک فناوری اطلاعات و ارتباطات (فاوا)', 'ICT PARK Technology Park',             'تهران',        'Tehran',          'تهران', 'Tehran',  50, 36, 'red',   48,  2200,  40, true, 4),
  ('alborz',  'پارک علم و فناوری البرز',        'Alborz Science and Technology Park',          'البرز',        'Alborz',          'کرج',   'Karaj',   46, 33, 'gold',  62,  1750,  18, true, 5),
  ('isfahan', 'شهرک علمی و تحقیقاتی اصفهان',    'Isfahan Science and Technology Town',         'اصفهان',       'Isfahan',         'اصفهان','Isfahan', 47, 52, 'blue',  410, 14200, 55, true, 6),
  ('fars',    'پارک علم و فناوری فارس',         'Fars Science and Technology Park',            'فارس',         'Fars',            'شیراز', 'Shiraz',  49, 70, 'green', 176, 5100,  30, true, 7),
  ('eaz',     'پارک علم و فناوری آذربایجان',    'Azerbaijan Science and Technology Park',      'آذربایجان شرقی','East Azerbaijan','تبریز', 'Tabriz',  30, 22, 'gold',  198, 6300,  33, true, 8),
  ('yazd',    'پارک علم و فناوری یزد',          'Yazd Science and Technology Park',            'یزد',          'Yazd',            'یزد',   'Yazd',    58, 58, 'red',   88,  2050,  19, true, 9),
  ('khz',     'پارک علم و فناوری خوزستان',      'Khuzestan Science and Technology Park',       'خوزستان',      'Khuzestan',       'اهواز', 'Ahvaz',   33, 64, 'blue',  74,  1900,  17, true, 10)
ON CONFLICT (park_id) DO NOTHING;
