# KSRcodes pvt.ltd · Timesheet workspace

A working incremental React/Express/Prisma application for monthly timesheets, scoped multi-stage review and approved-record amendments. This repository contains persistent backend behavior and API-connected screens, not a static dashboard.

**Not production accepted:** real Entra authentication, Azure deployment, native PostgreSQL validation in this workspace, full automated browser suite, load testing and backup restoration remain unverified. See `docs/status.md` and `docs/test-execution.md`.

## Quick start — local development

Requires Node.js 24 and npm. Run from this folder:

```bash
npm ci
npm run db:generate
```

Create `.env` with:

```dotenv
AUTH_MODE=development
NODE_ENV=development
DEV_DATABASE=pglite
APP_ORIGIN=http://localhost:5173
PORT=4000
```

Then:

```bash
npm run dev
```

Open **http://localhost:5173** and enter a fictional development identity. The embedded PostgreSQL engine applies the versioned SQL migrations and seeds fictional data once. Data persists under `.local/pglite`; no employee data is stored in browser localStorage. Only one application process may own a given embedded database directory. This adapter is explicitly rejected in production.

Development identities:

| Identity | Role |
|---|---|
| Aarav Mehta | Employee |
| Neha Kapoor | Employee |
| Priya Sharma | Team manager and employee |
| Rohan Verma | HR and employee |
| Isha Rao | System administrator and employee |

All seeded emails use `.example`. Sample weekdays, target minutes, workflows and timezone are illustrative, not approved company policies. The sample month is generated from the date when a fresh database is seeded. Do not use the development identity selector with real employee data.

## Native PostgreSQL development

1. Copy `.env.example` to `.env`; choose a local disposable password. Set LOCAL_DATABASE_PASSWORD and the matching DATABASE_URL. Leave DEV_DATABASE unset.
2. Run `docker compose up -d postgres`.
3. Run `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`, then `npm run dev`.
4. In a separate disposable database, run `TEST_NATIVE_POSTGRES=1 npm run test:api`. This test seeds fictional identities and changes account status; never target production.

## GitHub Pages static preview

The Pages workflow publishes a static frontend preview at
`https://KunalSingh4804.github.io/KSRcodes-timesheets/`. GitHub Pages does not
run this application's Express API or PostgreSQL database, so sign-in,
timesheets, approvals, and reports are unavailable on that preview. Use the
local development setup above for the complete fictional demo workflow.

Docker is optional for the embedded quick start. The supplied Dockerfile builds separate runtime and migration targets. Compose supplies a local PostgreSQL service, while Vite/Express run on the host for development.

## Try the complete business flow

1. Enter as Aarav. Open My timesheet, choose a day and add/edit an entry. Each entry save writes through the API with a revision check.
2. Submit the month and confirm. Ordinary editing becomes unavailable.
3. Sign out using the sidebar profile button. Enter as Priya, open Approvals, inspect the submitted entries and decide. A return/rejection requires a comment.
4. Enter as Rohan and complete HR review. Existing workflow instances preserve the submitted workflow version.
5. Return as Aarav, request a correction, edit the proposed entries and provide a reason. The existing approved entries stay unchanged until the amendment workflow finishes.
6. Review Submission history, approval timeline, notifications and report/export totals. HR can inspect the scoped audit trail and configure new workflow/policy/calendar versions.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:api
npm run build
npm audit --omit=dev
```

Playwright tests are included in `web/e2e`. In an environment that supports a local browser, install its Chromium dependency and run `npm run test:e2e`. The GitHub Actions workflow starts native PostgreSQL, applies clean migrations, runs checks/API tests, builds and runs Playwright. That remote workflow has not been executed here.

## First production identity

After applying migrations to an empty native PostgreSQL database, create a private `bootstrap.json` using the following field names and real approved values:

```json
{
  "company": "KSRcodes pvt.ltd",
  "timezone": "REPLACE_WITH_APPROVED_IANA_TIMEZONE",
  "tenantId": "REPLACE_WITH_COMPANY_TENANT_UUID",
  "adminObjectId": "REPLACE_WITH_ADMIN_ENTRA_OBJECT_UUID",
  "adminName": "REPLACE_WITH_ADMIN_NAME",
  "adminEmail": "REPLACE_WITH_ADMIN_EMAIL"
}
```

Run `npm run provision < bootstrap.json` through a controlled migration/administration process. The initial system administrator receives configuration and access administration rights, **not** HR or business approval rights. Do not commit this identity mapping file. Business users, role scopes, teams, assignments, calendars, policies and periods must be configured explicitly. Identity/access APIs are documented in OpenAPI; the identity and scoped-role administration UI is available under Administration → Identity & access.

## Repository map

- `web/src/`: responsive employee/reviewer/HR screens and reusable UI primitives.
- `server/src/`: authentication, authorization, transactional services, reports and REST controllers.
- `prisma/`: complete relational schema, migration, invariants and fictional seeds.
- `server/tests/`: unit, persistence and HTTP regressions.
- `docs/openapi.json`: versioned API contract.
- `docs/architecture.md`: diagrams, decisions, permissions and state machines.
- `docs/entra-sso.md`: tenant setup and test boundaries.
- `docs/azure-deployment.md`: proposed rollout and rollback.
- `docs/backup-recovery.md`: restore verification procedure.
- `docs/status.md`: phase status, outstanding work and company decisions.

No Azure resources, hosting charges, GitHub repository or production accounts were created as part of this local build.
