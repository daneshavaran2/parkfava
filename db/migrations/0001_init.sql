-- Initial schema for the self-hosted Postgres backend, replacing Supabase.
--
-- This consolidates every table from supabase/migrations/*.sql into their
-- final shape as of 2026-08-02, with two deliberate differences:
--   1. `auth.users` is replaced by our own `users` table (see below) — all
--      `references auth.users(id)` become `references users(id)`.
--   2. Row Level Security policies and the has_role()/is_company_owner()
--      SQL helper functions are dropped entirely. Authorization now lives
--      in TanStack Start server-function middleware (see src/lib/db/auth
--      once Phase 2 lands), not in the database — this is the standard
--      pattern for a self-hosted app with no direct client-to-DB access
--      (the browser never talks to Postgres directly, unlike Supabase's
--      PostgREST-backed model where RLS was the only enforcement layer).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE app_role AS ENUM ('admin', 'user', 'company_owner');

-- ===================== AUTH =====================

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  phone text,
  -- MFA/OTP state (previously stored in Supabase Auth's user_metadata).
  mfa_token text,
  mfa_token_expires_at timestamptz,
  mfa_otp_hash text,
  mfa_otp_expires_at timestamptz,
  mfa_otp_attempts integer NOT NULL DEFAULT 0,
  mfa_otp_send_count integer NOT NULL DEFAULT 0,
  mfa_otp_send_window_start timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- ===================== PARKS =====================

CREATE TABLE parks (
  park_id text PRIMARY KEY,
  name text NOT NULL,
  name_en text,
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_parks_active_sort ON parks(is_active, sort_order);

CREATE TABLE park_content (
  park_id text PRIMARY KEY REFERENCES parks(park_id) ON DELETE CASCADE,
  display_name text,
  description text,
  logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE park_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id text NOT NULL,
  image_url text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX park_images_park_idx ON park_images(park_id);

CREATE TABLE park_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id text NOT NULL,
  title text NOT NULL,
  body text,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX park_news_park_idx ON park_news(park_id);

-- ===================== EXHIBITION =====================

CREATE TABLE exhibition_companies (
  company_id text PRIMARY KEY,
  name text NOT NULL,
  name_en text,
  tagline text,
  category text,
  park_id text,
  city text,
  description text,
  logo_url text,
  website text,
  phone text,
  email text,
  address text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  catalog_url text,
  video_url text,
  founded_at date,
  intro text,
  founders text,
  export_potential text,
  headcount integer,
  headcount_full_time integer,
  headcount_part_time integer,
  knowledge_products_intro text,
  linkedin_url text,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_note text,
  latitude double precision CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude double precision CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  map_zoom smallint DEFAULT 16,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exhibition_companies_park_id ON exhibition_companies(park_id);
CREATE INDEX idx_exhibition_companies_status ON exhibition_companies(status);
CREATE INDEX exhibition_companies_owner_idx ON exhibition_companies(owner_user_id);

CREATE TABLE exhibition_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES exhibition_companies(company_id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  image_url text,
  video_url text,
  link_url text,
  catalog_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exhibition_products_company_id ON exhibition_products(company_id);

CREATE TABLE exhibition_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES exhibition_companies(company_id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exhibition_images_company_id ON exhibition_images(company_id);

CREATE TABLE company_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('exhibition', 'park')),
  owner_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('logo', 'gallery_image', 'catalog', 'form_fa', 'form_en', 'document', 'other')),
  title text,
  description text,
  file_url text NOT NULL,
  mime_type text,
  size_bytes bigint,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_attachments_owner ON company_attachments(owner_type, owner_id, kind, sort_order);

-- ===================== CONTENT =====================

CREATE TABLE about_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL,
  title text,
  body text,
  image_url text,
  video_url text,
  video_url_2 text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===================== TRIGGERS =====================

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_parks_updated BEFORE UPDATE ON parks
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_exh_companies_updated BEFORE UPDATE ON exhibition_companies
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_exh_products_updated BEFORE UPDATE ON exhibition_products
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_company_attachments_updated BEFORE UPDATE ON company_attachments
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_about_updated BEFORE UPDATE ON about_sections
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- First user to sign up becomes admin automatically (matches the previous
-- handle_first_user_admin() behavior); every user after that gets no role
-- by default (an admin grants roles explicitly via the admin panel).
CREATE OR REPLACE FUNCTION assign_first_user_admin()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE role = 'admin') THEN
    INSERT INTO user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_first_admin AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION assign_first_user_admin();
