# Dependency and Supply-Chain Report

## Lockfiles

| File | Used by | State |
|---|---|---|
| `bun.lock` | Dockerfile (`bun install --frozen-lockfile`), CI (`setup-bun`), Lovable | **Authoritative.** 676 packages |
| `package-lock.json` | Nothing in the build | **Stale** — last changed long before the current dependency set (SEC-010) |

`bunfig.toml` enforces a 24-hour minimum release age (three Lovable packages exempted).

## Known vulnerabilities (bun.lock)

| Stage | Tool | Critical | High | Moderate | Low | Total |
|---|---|---|---|---|---|---|
| Before (commit `d877c06`) | bun audit | 4 | 41 | 33 | 10 | 88 |
| After TanStack/Vite/Electron updates | bun audit | 1 | 32 | 22 | 6 | 61 |
| After `bun audit fix` (in-range) | bun audit | 0 | 1 | 1 | 0 | 2 |
| After zod 4 | bun audit / OSV-Scanner offline | 0 | 0 | 1 | 0 | **1** |

Remaining: `minimatch` 9.0.9 / 10.2.5 (GHSA-g3hv-75wg-m249, Moderate, ReDoS-class DoS)
reached only through `electron-builder` → `@electron/universal` (build machines).

### Upgrades applied

| Package | From | To | Reason |
|---|---|---|---|
| `@tanstack/react-start` / `start-server-core` | 1.168.26 / 1.169.15 | 1.169.5 / 1.169.45 | SEC-001 |
| `@tanstack/react-router`, `router-plugin` | 1.170.16 / 1.168.18 | 1.170.46 / 1.169.0 | Compatibility |
| `seroval` (transitive) | 1.5.4 | 1.8.1 | SEC-002 |
| `zod` | 3.25.76 | 4.6.7 (major) | SEC-006 |
| `electron` | 44.0.0 | 44.11.3 | SEC-025 |
| `vite` / `vitest` | 8.0.16 / 4.1.10 | 8.3.8 / 4.1.12 | Dev-server advisories |
| undici, shell-quote, fast-uri, js-yaml, brace-expansion, browserslist, postcss, nanoid, source-map-js, launch-editor | various | in-range fixes via `bun audit fix` | Build-tool advisories |

## Stale npm lockfile (package-lock.json)

npm audit: 8 Critical, 13 High, 15 Moderate, 1 Low (37 packages), including the
TanStack Start and seroval versions above. Trivy: 4 Critical, 25 High. See SEC-010.

## Supply-chain risk criteria (Trail of Bits supply-chain-risk-auditor)

- 84 direct dependencies measured; 18 flagged for **publisher concentration** (single
  human npm publisher), 14 of them shipped to production, e.g. `postgres` (porsager),
  `clsx`, `date-fns`, `react-hook-form`, `sonner`, `vaul`, `embedded-postgres`.
- 49 of 84 publish with npm build provenance.
- Advisory status, download volume, Scorecard and archived-repo checks: **unassessable**
  in this environment (OSV API blocked, GitHub token invalid). Advisory coverage was
  supplied by bun audit, npm audit and OSV-Scanner (offline database) instead.

## Install scripts

Installs use Bun, which runs dependency lifecycle scripts only for packages on its
built-in default allowlist or in `package.json` `trustedDependencies`. The project
trusts exactly one package, `@embedded-postgres/windows-x64` (desktop build).
`bun pm untrusted` lists two packages whose scripts were blocked:
`@embedded-postgres/linux-x64` (postinstall `hydrate-symlinks.js`) and
`electron-winstaller` (install `select-7z-arch.js`). Both belong to the desktop toolchain.

## SBOM

CycloneDX SBOM generated with Syft 1.57.1: [`evidence/sbom.cyclonedx.json`](evidence/sbom.cyclonedx.json).

## Container base images

`oven/bun:1` (build) and `node:22-slim` (runtime) are referenced by mutable tags, not
digests. No image was built or scanned here (no container runtime available); pinning
to digests is proposed in remediation-plan.md.
