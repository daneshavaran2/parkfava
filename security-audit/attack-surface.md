# Attack Surface

## Unauthenticated entry points

| Entry point | Type | Purpose | Controls |
|---|---|---|---|
| `signIn` | server fn POST | Email or national-ID login | Per-account 8/5 min + per-IP 60/15 min (now keyed correctly, SEC-003), constant-ish time (SEC-013) |
| `signUp` | server fn POST | Self-registration (role-less user) | 5/hour per IP |
| `signOutFn`, `getCurrentUser` | server fn | Session end / read | Cookie-bound |
| `askAssistant` | server fn POST | LLM chat (costs money) | 15/5 min per IP + 300/hour global; input ≤500 chars, ≤8 history turns |
| `getExhibitionCompanies`, `getPublicExhibitionProducts`, `getExhibitionCompanyDetail`, `getAboutSections`, `getAttachments`, `getParkContent`, `getActiveParks`, `getInactiveParkIds` | server fn GET | Public catalogue | Approved + active filter; detail strips review fields (SEC-012) |
| `/api/public/export` | HTTP GET | Full public dataset for the desktop app | Only approved/active companies; internal fields nulled |
| `/api/public/health` | HTTP GET | Liveness + DB check | Returns `{status, db}` only |
| `/api/public/csp-report` | HTTP POST | CSP violation sink | Global 100/min, zod-validated, logs only |
| `/api/public/debug-echo` | HTTP GET/POST | Request-id e2e test hook | **404 unless `NODE_ENV` is development/test** (SEC-014) |
| `/api/public/asset-audit` | HTTP GET | Upload integrity report | Admin session required (despite path) |
| `/assets/*` | HTTP GET | Uploaded files, ranges | Path confined to `UPLOAD_DIR`, MIME allowlist, `nosniff` (SEC-016) |
| Pages `/perf`, `/dev/logo` | SSR pages | Developer visual tests | No data access (SEC-031) |

## Authenticated entry points

- **Any signed-in user** (including self-registered): `changeMyPassword`, `getMyCompany`,
  `getCompanyChangeRequests` (owner/admin check inside), MFA functions (`getMfaStatus`,
  `setPhone`, `requestOtp`, `verifyOtp`), `whoAmI`.
- **Company owners** (`resolveEditMode` ownership check): `saveOwnedCompany`,
  `submitCompanyForReview`, image/product add/update/delete/reorder,
  `cancelOwnPendingChange`, `uploadExhibitionAssetFn`.
- **Admins** (`assertAdmin`/`requireAdmin`): users/roles, companies, approvals, change
  requests, parks, park content, about sections, attachments, AI settings, offline sync.

Coverage: 67 server functions; 13 unauthenticated (listed above); every mutating
function is exercised by `scripts/test-authz-coverage.py` (51 checks, all passing).

## Non-HTTP surface

| Surface | Exposure |
|---|---|
| GitHub Actions | Runs on push/PR; deploy job holds `LIARA_API_TOKEN`; third-party code: `oven-sh/setup-bun`, `@liara/cli` |
| Lovable sync | Anyone with Lovable project access can push code to the connected branch |
| npm/bun dependency tree | 676 packages resolved by `bun.lock` |
| Electron desktop app | Local only (127.0.0.1); pulls `/api/public/export` from `OFFLINE_SYNC_SOURCE` |
| LLM provider | Receives public company data + visitor questions |
| SMS provider | Receives phone numbers and OTP codes (once configured) |
