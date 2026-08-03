-- The Supabase-era MFA implementation stored these two fields inside
-- auth.users' user_metadata JSON blob; 0001_init.sql ported over the rest of
-- the MFA/OTP columns but missed these two.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_otp_last_sent_at timestamptz;
