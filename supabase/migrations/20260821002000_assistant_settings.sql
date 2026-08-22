CREATE TABLE IF NOT EXISTS public.assistant_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  api_key_encrypted text,
  api_key_last_four text,
  model text NOT NULL DEFAULT 'openai/gpt-4o-mini',
  is_enabled boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assistant_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.assistant_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
