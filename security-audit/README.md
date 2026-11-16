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
3. **Scanning** — 13 tools executed; registry Semgrep rules, CodeQL and ZAP not run (see tools-execution.md).
4. **Validation** — High/Medium code findings reproduced on a disposable database before patching.
5. **Patching** — 4 commits on `claude/epic-meitner-ctcy12`; nothing deployed; nothing pushed to `main`.
6. **Regression** — existing suites plus 19 unit tests and an 11-check auth hardening script.

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

Completed after all documents were written; corrections applied are listed below.

_(filled in by the final review step)_
