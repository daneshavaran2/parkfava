# Known CSP Noise

Violations that are safe to ignore when evaluating the report-only stream
before flipping to enforce mode. Add entries here as they surface, with a
short justification. Never dismiss a violation without an entry.

| `violated-directive` | `blocked-uri` pattern | Source | Notes |
| --- | --- | --- | --- |
| `script-src` | `chrome-extension://*` | Browser extension | User's extension injects a script. Not blockable server-side; safe to ignore. |
| `script-src` | `moz-extension://*` | Firefox extension | Same as above. |
| `img-src` | `data:` in `about:blank` | DevTools / preview | Non-user traffic. |

## Adding an entry

1. Copy the exact `violated-directive` and `blocked-uri` from the report.
2. Identify the source (extension, DevTools, embed).
3. Confirm the violation would NOT block a real user flow.
4. Only after all three, add a row and rerun the enforce checklist.

## Enforce rollout checklist

- [ ] ≥7 days of production traffic under `Content-Security-Policy-Report-Only`
- [ ] Zero critical violations (any first-party or `*.supabase.co` origin)
- [ ] All non-critical violations documented in the table above
- [ ] Rollback tested: `CSP_ENFORCE=0` returns policy to report-only
