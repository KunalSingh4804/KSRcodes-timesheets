# Microsoft Entra ID configuration

The integration boundary is implemented; no real tenant login has been verified.

1. Register a single-tenant **Web** application in your company Entra tenant. Use a dedicated registration per environment.
2. Set its exact HTTPS callback to `https://YOUR_APP_ORIGIN/auth/callback`. For local SSO tests use the exact localhost callback configured in `.env`.
3. Configure only OIDC `openid profile email` for sign-in. This application does not call Microsoft Graph or request directory-wide Graph permissions. Follow your tenant's consent and Conditional Access process.
4. Put `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_REDIRECT_URI`, `APP_ORIGIN`, `DATABASE_URL` and `AUTH_MODE=entra` into approved environment configuration. Production secrets must come from Key Vault references. Do not paste secrets into chat, source files or logs.
5. On an empty migrated database, provision the company and initial system administrator with `npm run provision < bootstrap.json`; see README. Keep that identity/configuration file private. Its tenant ID must match configuration. No automatic user creation occurs during sign-in.
6. Provision employees and bind their immutable tenant/object IDs with the authorized identity mapping endpoint. Role assignments are separate from identity mapping. Do not map by email alone.
7. Test successful sign-in, wrong tenant, invalid audience/issuer, replayed callback, expired state, unprovisioned object ID and disabled accounts in staging. Validate Secure/SameSite/HttpOnly cookies and CSRF rejection.
8. Application logout deletes the local session. It does not claim to revoke all Entra sessions or downstream refresh tokens. Configure tenant session/Conditional Access policies separately. The app stores no sign-in tokens in browser storage.

The development identity selector only exists when AUTH_MODE=development and NODE_ENV is not production, and only permits fictional `.example` accounts. Production startup refuses development authentication. The embedded development database is also refused in production.

References checked during implementation:
- https://learn.microsoft.com/en-us/entra/msal/javascript/node/acquire-token-requests
- https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/request.md
- https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers
