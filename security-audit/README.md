# Security Audit — parkfava (2026-11-16)

Start with the [executive summary](executive-summary.md), then the
[final report](final-security-audit.md).

## Documents

| # | File | Content |
|---|---|---|
| 1 | [README.md](README.md) | This index and execution summary |
| 2 | [executive-summary.md](executive-summary.md) | Management summary and dashboard |
| 3 | [architecture-map.md](architecture-map.md) | Components, data flows (Mermaid) |
| 4 | [asset-inventory.md](asset-inventory.md) | Sensitive assets |
| 5 | [attack-surface.md](attack-surface.md) | Entry points |
| 6 | [trust-boundaries.md](trust-boundaries.md) | Boundaries and diagram |
| 7 | [threat-model.md](threat-model.md) | STRIDE threat register |
| 8 | [skill-inventory.md](skill-inventory.md) | Security skills reviewed, installed, executed |
| 9 | [tools-execution.md](tools-execution.md) | Scanner versions, commands, exit codes |
| 10 | [findings.md](findings.md) | Vulnerability register (SEC-001 … SEC-032) |
| 11 | [critical-findings.md](critical-findings.md) | Critical/High items and immediate actions |
| 12 | [false-positives.md](false-positives.md) | Rejected candidates |
| — | [fp-check-verification.md](fp-check-verification.md) | fp-check verdicts for all 32 findings (phases, 13 questions, 6 gates) |
| 13 | [dependency-report.md](dependency-report.md) | Dependencies, advisories, SBOM |
| 14 | [cloud-security.md](cloud-security.md) | Hosting and container |
| 15 | [api-security.md](api-security.md) | OWASP API Top 10 |
| 16 | [ai-agent-security.md](ai-agent-security.md) | Assistant / OWASP LLM Top 10 |
| 17 | [remediation-plan.md](remediation-plan.md) | Prioritised fixes |
| 18 | [patch-validation.md](patch-validation.md) | Before/after tests |
| 19 | [risk-register.md](risk-register.md) | Residual risks |
| 20 | [final-security-audit.md](final-security-audit.md) | Consolidated report |
| — | [security-baseline.md](security-baseline.md) | Controls before/after |
| — | [proposed-security-workflow.yml](proposed-security-workflow.yml) | CI security workflow (not active) |
| — | [evidence/](evidence/) | Raw scanner output, test logs, SBOM (secrets redacted) |

## Execution summary

1. **Phase 0** — 5 skill repositories cloned and reviewed (no installs); 9 Trail of Bits plugins already installed and used.
2. **Discovery** — 67 server functions, 5 public HTTP routes, 15 tables, 25 environment variables mapped.
3. **Scanning** — 12 tools executed; registry Semgrep rules, CodeQL and ZAP not run (see tools-execution.md).
4. **Validation** — SEC-003, SEC-004 and SEC-005 reproduced against the pre-fix code on a disposable database; SEC-007 verified after the fix only; dependency findings verified by version and re-audit.
5. **Patching** — commits `763c1c6`, `5e9dc7c`, `2377040`, `97d4db0` on `claude/epic-meitner-ctcy12`; nothing deployed; nothing pushed to `main`.
6. **Regression** — existing suites plus 19 unit tests and an 11-check auth hardening script.
7. **fp-check** — all 32 findings verified with Trail of Bits fp-check (phases 1–5, 13 questions, 6 gates): 11 true positives, 21 false positives as vulnerabilities (kept as hardening or risk items). Variant fix for SEC-006: length caps on all array validators.

## Re-running the evidence

```bash
bunx vitest run tests/unit
```

```bash
python3 scripts/test-authz-coverage.py
```

```bash
DATABASE_URL=postgres://… python3 scripts/test-auth-hardening.py
```

The last two need a dev server on `localhost:8080` and a disposable database (the
auth hardening script also needs `MFA_ENFORCED=true`). Never point them at production.

## Independent review record

An independent reviewer (a separate agent with no access to the audit conversation,
read-only) checked every finding's file and line, every evidence claim and the
consistency of counts across documents. It confirmed package versions, status and
severity counts, exit codes and all test tallies, and raised the following, all of
which were corrected:

| # | Issue raised | Resolution |
|---|---|---|
| 1–6 | Seven line references pointed at a declaration or the pre-fix line instead of the cited statement (SEC-003, 004, 007, 013, 015, 026, 029) | Corrected in findings.md |
| 7 | "Phase 8 commit (this report)" unnamed | Named `97d4db0` everywhere and added to SEC-004/005/018/019/020 |
| 8 | Gitleaks "215 commits" was the `rev-list` count incl. merges; two new commits unscanned | Re-ran Gitleaks after the final commits: 168 commits scanned, same 3 historical leaks |
| 9 | Semgrep raw counts not backed by an evidence file | Added `semgrep-run{1,2,3}-scans.json` and corrected figures |
| 10 | "13 tools" counted the project test suites | Corrected to 12 tools |
| 11 | "Tested in 6 of 11 domains" but only 5 rows said Tested | Corrected to 5 |
| 12 | README claimed all High/Medium findings were reproduced; SEC-007 was not | Wording corrected |
| — | SEC-026 Informational contradicted risk R-02 = 6 | Raised to Medium (CWE-308) |
| — | SEC-006 rated below the advisory without rationale | Rationale added |
| — | R-01 implied SEC-004/005 are exploitable in production while MFA is off | Reworded |
| — | Claims for SEC-003/012/014/016, the post-fix zizmor run and the 88-advisory baseline had no raw output | Captured: `xff-poc-baseline.txt`, `prod-build-checks.txt`, `zizmor-postfix.json`, `bun-audit-baseline-d877c06.json` |
| — | Threat-model residual column did not follow its own L × I rule | Recomputed |
| — | Checkov evidence quoted salts and hash prefixes of the SEC-023 hashes; Bandit evidence quoted a test password | Removed from the evidence files |
