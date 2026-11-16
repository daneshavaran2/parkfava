# Security Skill Inventory

Phase 0 of the audit, run 2026-11-16. Every repository was cloned read-only into an
isolated scratch directory; nothing from it was installed or executed unless stated
below. "Executed" means the skill's workflow actually ran against this project.

## Repositories reviewed

| Repository | Commit | Last commit | Available | Content |
|---|---|---|---|---|
| trailofbits/skills | `149d7b21f406` | 2026-11-12 | Yes | 47 Claude Code plugins (marketplace `trailofbits`) |
| OWASP/secure-agent-playbook | `65d4efd2cd0b` | 2026-10-15 | Yes | 2 plugins, 20 skills (code security, AI security) |
| UnitOneAI/SecuritySkills | `70bc259bb01a` | 2026-06-18 | Yes | 45 skills + 5 roles (index.yaml v1.0.0); no plugin manifest |
| secureIO-GmbH/security-skills | `49f63fb87a4a` | 2026-03-27 | Yes | 1 plugin, 4 skills (v1.0.0) |
| howardhsieh/agent-security-skills | `12dd0d9ef701` | 2026-10-12 | Yes | 2 plugins (agentsec-kit 0.2.2, agentsec-guard 0.2.2), 8 skills |

## Security review of the skills themselves

Checks run over every non-fixture file (grep, read-only): pipe-to-shell installers,
`eval`/`Invoke-Expression`, network calls in scripts, reads of credential paths
(`~/.ssh`, `~/.aws`, token env vars), destructive commands, and instructions that try to
steer an agent ("do not tell the user", "ignore previous instructions", disabling
permissions). Test fixtures are excluded because several repos ship deliberately
malicious samples for their own detectors.

| Repository | Result |
|---|---|
| trailofbits/skills (9 installed plugins) | Reviewed before installation (earlier step of this engagement, same day). Only `fp-check` registers hooks: two `prompt`-type Stop/SubagentStop hooks (LLM check, no shell). Scripts in static-analysis and supply-chain-risk-auditor run only when the skill is invoked. No issues found. |
| OWASP/secure-agent-playbook | All matches are documentation describing attacks (e.g. "avoid eval()"). 7 maintainer scripts extract reference data; skills do not invoke them. No issues found. |
| UnitOneAI/SecuritySkills | Markdown-only skills; 8 Ruby repository-validation scripts not used by skills. Skills explicitly instruct the agent to treat embedded instructions as findings. No issues found. |
| secureIO-GmbH/security-skills | Markdown only, no scripts. No issues found. |
| howardhsieh/agent-security-skills | Scripts contain detection regexes only (no network calls). **`agentsec-guard` registers command hooks on every Bash/Read/Edit/Write/Grep/Glob tool call and on SessionStart** (local Python, declared "no network"). Intrusive by design; not installed. |

`howardhsieh/.../skill-supply-chain-audit/scripts/audit_skill.py` was going to be run to
audit the other repositories; the session's permission policy refused to execute
unreviewed third-party code, so it was **not executed**.

## Skill registry

Legend — Type: **AI skill** (instructions for the agent), **AI skill + scanner**
(skill that drives a tool), **Conceptual** (checklist only). Install: **Installed**
(user-scope plugin in this session), **Not installed** (needs approval).

### Installed and used (trailofbits/skills @ 149d7b21)

| Skill | Version | Capability | Type | Dependencies | Security review | Compatible | Executed |
|---|---|---|---|---|---|---|---|
| static-analysis:semgrep | 1.5.1 | SAST with Semgrep + third-party rules | AI skill + scanner | semgrep CLI, uv | Passed | Yes | **Yes** — registry (semgrep.dev) blocked by network policy; ran the official rules from the `semgrep/semgrep-rules` GitHub mirror plus Trail of Bits, elttam, Apiiro and kondukto rules through the skill's `run-scans.sh` |
| static-analysis:codeql | 1.5.1 | Interprocedural taint analysis | AI skill + scanner | CodeQL CLI | Passed | Yes | **No** — CodeQL 2.27.4 bundle downloaded and checksum-verified; execution refused by the session permission policy |
| static-analysis:sarif-parsing | 1.5.1 | SARIF merge/triage | AI skill | uv | Passed | Yes | Yes (merge_sarif.py) |
| insecure-defaults:audit | 2.0.3 | Fail-open/fallback-secret/weak-crypto sweeps | AI skill + workflow | `Workflow` tool | Passed | **Partial** — the pipeline needs a `Workflow` tool absent from this session | Partially: its seed-pattern corpus (6 categories) plus stack-specific derived patterns were run by hand and every hit verified manually |
| supply-chain-risk-auditor | 2.0.4 | Dependency risk (advisories, maintainers, install scripts) | AI skill + scanner | uv, OSV API, GitHub API | Passed | Partial — OSV API blocked, `gh` token invalid | Yes; advisory criterion unassessable (0/84), supplemented with `bun audit`, `npm audit`, OSV-Scanner offline DB |
| differential-review | 1.1.4 | Security review of diffs | AI skill | git | Passed | Yes | No (its method was applied manually to the auth/national-ID changes; skill not invoked) |
| fp-check | 1.0.5 | False-positive elimination with gates | AI skill + agents + hooks | — | Passed (prompt hooks) | Yes | No — replaced by direct reproduction tests (baseline vs patched) for every High/Medium code finding |
| sharp-edges | 1.1.3 | Misuse-prone API/config review | AI skill + agent | — | Passed | Yes | No (manual review of session, crypto, upload APIs instead) |
| variant-analysis | 2.0.4 | Variant hunting from a known bug | AI skill | semgrep/codeql optional | Passed | Yes | No (variant search done with grep; see findings.md "Variants") |
| audit-context-building | 2.0.2 | Function-level context building | AI skill + agent | — | Passed | Yes | No |
| testing-handbook-skills (15) | 1.2.2 | Fuzzing, sanitizers, Wycheproof | AI skills | language toolchains | Passed | Not applicable — no C/C++/Rust/crypto implementations in scope | No |

### Reviewed, not installed (installation requires your approval)

| Repository / skill | Capability | Type | Overlaps with | Recommendation |
|---|---|---|---|---|
| OWASP code-security-skills: api-security-review, web-security-review, code-review-security, secrets-scan, sca-audit, iac-security-review | OWASP ASVS/API Top 10 review checklists | Conceptual | UnitOne appsec/*, ToB sharp-edges, supply-chain-risk-auditor | **Install first** — best ASVS-mapped checklists; markdown only |
| OWASP ai-security-skills: prompt-injection-test, llm-risk-assess, mcp-server-review, agent-security-audit | LLM/agentic risk assessment | Conceptual | UnitOne ai-security/* | Install with the above (assistant feature in scope) |
| UnitOneAI appsec/owasp-top-10-web, api-security, threat-modeling, devsecops/pipeline-security, cloud/container-security, ai-security/llm-top-10, incident-response/* | Broad checklists incl. IR and compliance | Conceptual | OWASP + secureIO | Optional; no plugin manifest (manual skills-dir install) |
| secureIO security-audit, threat-model, security-scan, security-arch-review | Generic audit/threat model | Conceptual | All of the above | Low priority (duplicates) |
| howardhsieh agentsec-kit (agent-config-audit, skill-supply-chain-audit, mcp-server-security-review, …) | Audits the *agent environment*, not the app | AI skill + scripts | — | Useful for reviewing your Claude Code setup; out of scope for the app |
| howardhsieh agentsec-guard | Runtime guard hooks on every tool call | Hooks | — | **Do not install** without a deliberate decision: it intercepts every tool call |

### Duplicate capabilities

Threat modeling (4 repos), API security (OWASP, UnitOne), web OWASP Top 10 (OWASP,
UnitOne), dependency/SCA (OWASP, UnitOne, ToB), secrets (OWASP, UnitOne), prompt
injection (OWASP, UnitOne), IaC/container (OWASP, UnitOne). The ToB skills are the only
ones that execute tools; the others are checklists.

## Prioritized installation plan (pending approval)

1. OWASP `code-security-skills` and `ai-security-skills` (markdown only, no hooks, no scripts invoked).
2. UnitOne `devsecops/pipeline-security` and `incident-response/*` (gaps not covered by ToB).
3. Nothing from secureIO (duplicate); `agentsec-guard` only after a separate decision.
