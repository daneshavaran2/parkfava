# Asset Inventory

Sensitivity: **S1** credentials/keys, **S2** personal data, **S3** integrity-critical
business data, **S4** public content.

| Asset | Where | Sensitivity | Owner of access | Notes |
|---|---|---|---|---|
| Password hashes (scrypt, 16-byte salt, 64-byte key) | `users.password_hash` | S1 | Server only | `src/lib/auth/password.server.ts` |
| Session tokens (32 random bytes, hex) | `sessions.id` (stored **unhashed**), `session` cookie | S1 | Server; browser cookie `httpOnly`, `SameSite=Lax`, `Secure` in production | SEC-027 |
| MFA state / OTP hashes | `users.mfa_*`, `sessions.mfa_verified_until` (new) | S1 | Server | SHA-256 of 6-digit OTP, 5-min TTL |
| OpenRouter API key | `assistant_settings.api_key_encrypted` (AES-256-GCM) or `OPENROUTER_API_KEY` env | S1 | Admins (set/replace), server | Key derived from `SETTINGS_ENCRYPTION_KEY` **or `DATABASE_URL`** (SEC-017) |
| `DATABASE_URL` | Liara env | S1 | Platform | Also used as fallback encryption material |
| `LIARA_API_TOKEN`, `OPENROUTER_API_KEY` | GitHub Actions secrets | S1 | Repo admins; deploy job | `.github/workflows/deploy.yml` |
| SMS provider key | `SMS_API_KEY` env (not configured yet) | S1 | Platform | Melipayamak puts the key in the URL path (provider design) |
| Initial-password hashes for 67 companies | `scripts/company-national-id-logins.json` (in git) | S1/S2 | Anyone with repo access | SEC-023 — remove after provisioning |
| Embedded Postgres password (desktop) | `userData/pg-password` (random 24 bytes) | S1 | Local OS user | `electron/main.cjs:62` |
| User identities | `users.email`, `users.national_id`, `users.phone` | S2 | Self, admins | National IDs of companies are public records; phones are personal |
| Company contact data | `exhibition_companies.email/phone/address/founders` | S2/S4 | Public once approved | Draft data hidden until approved |
| Company profiles, products, images, attachments | `exhibition_*`, `company_attachments`, uploads disk | S3/S4 | Owners (own company), admins | Changes to approved companies go through `exhibition_change_requests` |
| Review decisions | `exhibition_companies.status/reviewed_by/rejection_note`, change requests | S3 | Admins | Now hidden from public responses (SEC-012) |
| Roles | `user_roles` | S3 | Admins (grant/revoke), DB trigger for first user | SEC-029 |
| Parks, park content, news, about sections | `parks`, `park_*`, `about_sections` | S3/S4 | Admins | |
| Uploaded files | `UPLOAD_DIR` (Liara disk) | S4 | Public read via `/assets/*`; write admins/owners | Extension allowlist, size limits, path confinement |
| Rate-limit counters | `rate_limit_hits` | S3 | Server | Integrity matters for abuse controls (SEC-003) |
| Source code and git history | GitHub `daneshavaran2/parkfava`, Lovable | S1 (history) / S3 | Repo collaborators | `.env` with public-by-design keys in history (SEC-022) |
| Logs | Liara stdout logs (JSON envelopes) | S2 | Platform operators | OTP/phone removed from logs (SEC-018) |
| Backups | Not defined in the repository | S1–S4 | Unknown | Requires environment access |
