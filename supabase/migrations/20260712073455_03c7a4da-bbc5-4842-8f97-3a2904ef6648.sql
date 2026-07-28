
CREATE TABLE public.parks (
  park_id text PRIMARY KEY,
  name text NOT NULL,
  province text,
  city text,
  mx numeric NOT NULL DEFAULT 50,
  my numeric NOT NULL DEFAULT 50,
  color text NOT NULL DEFAULT 'blue',
  companies_hint integer NOT NULL DEFAULT 0,
  jobs integer NOT NULL DEFAULT 0,
  area integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.parks TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.parks TO authenticated;
GRANT ALL ON public.parks TO service_role;

ALTER TABLE public.parks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view parks" ON public.parks
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert parks" ON public.parks
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update parks" ON public.parks
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete parks" ON public.parks
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER parks_touch_updated_at
  BEFORE UPDATE ON public.parks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.parks (park_id, name, province, city, mx, my, color, companies_hint, jobs, area, sort_order) VALUES
  ('razavi',  'پارک علم و فناوری خراسان رضوی', 'خراسان رضوی', 'مشهد',   78, 30, 'blue',  312, 9800,  48, 1),
  ('semnan',  'پارک علم و فناوری سمنان',        'سمنان',       'سمنان',  56, 41, 'gold',  96,  2400,  21, 2),
  ('mazand',  'پارک علم و فناوری مازندران',     'مازندران',    'ساری',   52, 26, 'green', 128, 3650,  27, 3),
  ('tehran',  'پارک فناوری اطلاعات و ارتباطات (فاوا)', 'تهران', 'تهران', 50, 36, 'red',   48,  2200,  40, 4),
  ('isfahan', 'شهرک علمی و تحقیقاتی اصفهان',    'اصفهان',      'اصفهان', 47, 52, 'blue',  410, 14200, 55, 5),
  ('fars',    'پارک علم و فناوری فارس',         'فارس',        'شیراز',  49, 70, 'green', 176, 5100,  30, 6),
  ('eaz',     'پارک علم و فناوری آذربایجان',    'آذربایجان شرقی', 'تبریز', 30, 22, 'gold',  198, 6300, 33, 7),
  ('yazd',    'پارک علم و فناوری یزد',          'یزد',         'یزد',    58, 58, 'red',   88,  2050,  19, 8),
  ('khz',     'پارک علم و فناوری خوزستان',      'خوزستان',     'اهواز',  33, 64, 'blue',  74,  1900,  17, 9)
ON CONFLICT (park_id) DO NOTHING;
