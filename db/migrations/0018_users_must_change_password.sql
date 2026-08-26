-- Bulk company-owner provisioning uses each company's contact-person mobile
-- number as an initial password (see scripts/provision-company-owners.ts).
-- A phone number is not a safe *permanent* secret, so every provisioned
-- account is flagged to force a change on first authenticated use of
-- /my-company (see src/routes/my-company.tsx).
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
