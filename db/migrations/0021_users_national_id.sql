-- Park member companies sign in with their 11-digit legal-entity national ID
-- instead of an email address (see src/lib/auth/login-id.ts and
-- scripts/provision-national-id-logins.ts). Such an account may have no
-- email at all, so `email` becomes optional — but every account must still
-- have at least one of the two, or nobody could ever sign in to it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id text UNIQUE;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_login_id_present') THEN
    ALTER TABLE users ADD CONSTRAINT users_login_id_present
      CHECK (email IS NOT NULL OR national_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_national_id_format') THEN
    ALTER TABLE users ADD CONSTRAINT users_national_id_format
      CHECK (national_id ~ '^[0-9]{11}$');
  END IF;
END $$;
