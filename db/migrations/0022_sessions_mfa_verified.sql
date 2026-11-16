-- MFA verification belongs to the session that passed the OTP check, not to
-- the account. It used to live on users.mfa_token_expires_at, so one OTP
-- check made *every* session of that account count as verified for 24h —
-- including a session someone opened with a stolen password, who then never
-- saw an OTP prompt. Additive and nullable: existing sessions simply read as
-- not verified, which only matters while MFA_ENFORCED=true.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_verified_until timestamptz;
