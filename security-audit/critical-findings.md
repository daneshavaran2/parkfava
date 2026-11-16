# Critical and High Findings

All Critical and High findings have patches applied on branch
`claude/epic-meitner-ctcy12`. **None of them is fixed in production until the branch is
merged to `main` and deployed.**

| ID | Severity | Title | Status | Action still required |
|---|---|---|---|---|
| SEC-001 | Critical | Reflected XSS in TanStack Start server-function responses | Patched (upgrade) | Deploy |
| SEC-002 | Critical | seroval deserialization (unauthenticated) | Patched (upgrade) | Deploy |
| SEC-004 | High (conditional) | MFA verification shared by every session | Patched, regression-tested | Deploy before enabling MFA |
| SEC-005 | High (conditional) | Verified phone replaceable without MFA | Patched, regression-tested | Deploy before enabling MFA |

Immediate actions, in order:

1. Merge and deploy the branch (closes SEC-001/002 in production; migration `0022`
   applies automatically at startup).
2. Decide on `package-lock.json` (SEC-010): it still pins the SEC-001/002 versions for
   anyone installing with npm.
3. Only then plan MFA enablement (SEC-026): it was unsafe to enable before SEC-004/005.

Details: [findings.md](findings.md).
