# Rejected Findings (False Positives and Non-Issues)

Each item was checked against the code; none is in the findings register. Separately,
eight register entries (SEC-008, 013, 014, 015, 018, 019, 020, 021) were judged **false
positives as exploitable bugs** by fp-check and kept only as hardening — see
[fp-check-verification.md](fp-check-verification.md).

| Source | Rule / item | Location | Reason rejected |
|---|---|---|---|
| Semgrep | `html-in-template-string` (4) | `src/components/fava/OsmMap.tsx:67-69`, `CompanyMap.tsx:128` | Title and address pass through `escapeHtml()`; coordinates are numbers formatted by `formatCoordinate` |
| Semgrep | `insecure-innerhtml`, `insecure-document-method` | `src/lib/fava/image-slot.js:237` | Shadow-DOM template built only from constant strings |
| Semgrep | `contains-bidirectional-characters` | `scripts/atlas-data.json:338` | Stray U+202C (pop directional formatting) in Persian data text; no override characters, not source code |
| Semgrep | `unsafe-formatstring` (7) | console logging in scripts, `electron/main.cjs:147`, `offline-import.server.ts` | Log message formatting, no format-string sink in JS |
| Semgrep | `insecure-object-assign` | `scripts/extract-booklet-docs.ts:687` | One-off local script over trusted input |
| Semgrep | `detect-insecure-websocket` | `security-audit/evidence/osv-scanner.json` | Advisory text inside this audit's own evidence file |
| Semgrep | `dynamic-urllib-use-detected`, `insecure-urlopen` | `scripts/test-*.py` | Test harness calling a fixed `http://localhost:8080` |
| Semgrep | `detect-generic-ai-*` | `src/lib/app-settings.server.ts:4`, assistant files | Informational "AI API in use" markers |
| Semgrep | `dockerfile-source-not-pinned`, `use-distroless-base-image` | `Dockerfile:3,13` | Hardening suggestions (digest pinning noted in remediation-plan.md); not vulnerabilities |
| Semgrep | `bun-missing-minimum-release-age` | `bunfig.toml:3` | `minimumReleaseAge = 86400` is set; rule flags the exclusion list (3 Lovable packages, documented) |
| Apiiro | `generic-one-liners` (25) | `src/components/ui/*.tsx`, `views.tsx`, `flags.tsx` | Long minified-style lines in shadcn/ui components and inline SVG data, not obfuscated code |
| Apiiro | `python-obfuscation-*` (3) | `scripts/test-*.py` | Heuristic on JSON/seroval encoding helpers in tests |
| Bandit | B310 (5), B105, B110, B112, B108, B608 | `scripts/test-*.py` | Test-only code: fixed localhost URLs, a test fixture password, a SQL string built from a test constant |
| Checkov | CKV_SECRET_6 (67) | `scripts/company-national-id-logins.json` | Not secrets in plaintext, but hashes — tracked as SEC-023 instead (risk is brute force, not disclosure) |
| Trivy / OSV | 29–37 packages | `package-lock.json` | Duplicates of SEC-010 (one finding for the stale lockfile, not one per package) |
| Manual | Mass assignment in `saveOwnedCompany` | `src/lib/exhibition-api.functions.ts:145` | `status`, `is_active`, `owner_user_id`, review fields are stripped before writing; approved companies go through change requests |
| Manual | IDOR on images/products/change requests | `exhibition-api.functions.ts` | Company derived from the stored row and checked with `resolveEditMode`; authz suite owner-A→B tests pass |
| Manual | Path traversal in `/assets/*` | `src/lib/storage/local-storage.server.ts:56` | `resolveSafePath` confines to the upload root |
| Manual | Stored XSS through uploads (SVG/HTML) | `src/lib/storage/mime.ts:57` | Allowlist excludes script-capable types; unknown types served as `application/octet-stream` |
| Manual | SQL injection in assistant search | `src/lib/assistant.functions.ts` | Parameterized `LIKE` values (wildcards unescaped only affect matching) |
| Manual | CSRF on server functions | all | Mutations are POST with JSON + custom header; cookie `SameSite=Lax`; GET functions are read-only |
| Manual | Electron renderer RCE | `electron/main.cjs:300` | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, local-only server |
| Manual | `/api/public/csp-report` log flooding | `src/routes/api/public/csp-report.ts` | Global 100/minute cap |
