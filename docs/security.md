# Security and threat model

## Assets and trust boundaries
Employee work descriptions, assignments, decision history, Entra identity mappings, session tokens and CSV exports are protected assets. Boundaries: browser ↔ API, API ↔ Entra, API ↔ PostgreSQL, runtime ↔ Key Vault, and migration/operations identities ↔ production database.

| Threat | Implemented control | Remaining verification |
|---|---|---|
| Employee IDOR / cross-team access | Query scopes and service ownership checks; assigned approval tasks | Native database/production regression suite |
| Project-manager data leakage | Project-only review DTO and report aggregation | Browser review of mixed-project amendment cases |
| Forged or cross-tenant identity | MSAL code exchange; jose signature, issuer, audience, tenant, nonce and object-ID checks | Real tenant positive/negative sign-in and logout tests |
| CSRF / session theft | Origin checks, per-session CSRF token, hashed opaque session IDs; HttpOnly Secure production cookies | HTTPS reverse-proxy and cookie tests on staging |
| Stale decisions / overwrites | Serializable transactions, revisions, state gates and actor-bound idempotency | Native concurrent request/load testing |
| Silent approved-record edits | Ordinary edit endpoints require DRAFT; amendment workflow and snapshots | Independent audit retention policy |
| Audit tampering | No mutation API; database append-only triggers | Restricted runtime DB role and externally retained audit sink |
| Malicious CSV cells | Formula prefix neutralization and CSV quoting | Test with company spreadsheet tooling |
| Abuse / error leaks | Size bounds, Zod validation, rate limits, Helmet, correlation IDs, safe error middleware | Distributed rate-limit store before multiple replicas |
| Disabled account reuse | Active-user lookup on every request; deactivation deletes sessions | Entra deprovisioning synchronization process |

No employee monitoring or browser-activity-derived hours. Logs omit request bodies, cookies, tokens and work descriptions. API responses use no-store. Retention durations, archival rules, legal holds and recovery objectives are stakeholder decisions; no automatic historical deletion is enabled.

Before production: configure a least-privilege runtime database role (no DDL/TRUNCATE/history UPDATE/DELETE), separate migration identity, TLS to PostgreSQL with certificate verification, private DNS/network access, Key Vault references through managed identity, protected backup retention and monitoring/alerting. Run dependency audit and review known findings in the execution report. Use a shared rate-limit store or ingress control before horizontally scaling. Session expiry is absolute eight hours in this increment; idle timeout and session revocation UX need company confirmation.
