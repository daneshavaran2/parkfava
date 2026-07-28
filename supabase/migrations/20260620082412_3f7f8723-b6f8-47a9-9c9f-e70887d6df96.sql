
-- App role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- user_roles table
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- park_content
CREATE TABLE public.park_content (
  park_id TEXT PRIMARY KEY,
  display_name TEXT,
  description TEXT,
  logo_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT ON public.park_content TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.park_content TO authenticated;
GRANT ALL ON public.park_content TO service_role;
ALTER TABLE public.park_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "park_content public read" ON public.park_content FOR SELECT USING (true);
CREATE POLICY "park_content admin insert" ON public.park_content FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "park_content admin update" ON public.park_content FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "park_content admin delete" ON public.park_content FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- park_images
CREATE TABLE public.park_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  park_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  caption TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX park_images_park_idx ON public.park_images(park_id);
GRANT SELECT ON public.park_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.park_images TO authenticated;
GRANT ALL ON public.park_images TO service_role;
ALTER TABLE public.park_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "park_images public read" ON public.park_images FOR SELECT USING (true);
CREATE POLICY "park_images admin insert" ON public.park_images FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "park_images admin update" ON public.park_images FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "park_images admin delete" ON public.park_images FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- park_news
CREATE TABLE public.park_news (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  park_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX park_news_park_idx ON public.park_news(park_id);
GRANT SELECT ON public.park_news TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.park_news TO authenticated;
GRANT ALL ON public.park_news TO service_role;
ALTER TABLE public.park_news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "park_news public read" ON public.park_news FOR SELECT USING (true);
CREATE POLICY "park_news admin insert" ON public.park_news FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "park_news admin update" ON public.park_news FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "park_news admin delete" ON public.park_news FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Auto-grant admin role to first user
CREATE OR REPLACE FUNCTION public.handle_first_user_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_assign_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_first_user_admin();
