-- Singleton, server-only configuration for the OpenRouter-backed assistant.
-- api_key_encrypted is AES-GCM ciphertext produced by app-settings.server.ts;
-- the encryption secret remains outside the database.
CREATE TABLE assistant_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  api_key_encrypted text,
  api_key_last_four text,
  model text NOT NULL DEFAULT 'openai/gpt-4o-mini',
  is_enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO assistant_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
