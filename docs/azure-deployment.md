# Azure deployment, rollback and operations

Status: deployment design and container source supplied; Azure resources have not been provisioned. No tenant, subscription, credentials, real SSO test, restore exercise or production performance test is available in this workspace.

## Resources and environments

Create separate development, staging and production resource groups/configurations. Proposed resources per deployed environment:

- Azure Container Registry for immutable runtime and migration images.
- A VNet-integrated Azure Container Apps environment, with a Container App serving the bundled React application and Express API on port 4000.
- Azure Database for PostgreSQL Flexible Server with private access and linked private DNS; choose a supported regional SKU/version after capacity and cost review.
- Azure Key Vault with managed-identity access for the Container App. Reference DATABASE_URL and the Entra client secret rather than copying secrets into deployment files.
- Azure Monitor/Log Analytics and Application Insights. The app emits structured correlation-based error logs; Application Insights SDK instrumentation and alert rules remain to be configured and tested.
- A controlled migration job using the `migration` image target inside the approved network. No runtime startup migration.

Keep the database private. Allow outbound Entra and Key Vault access according to network policy. Require HTTPS ingress; set `TRUST_PROXY=1` only for the intended single trusted reverse proxy. Set `APP_ORIGIN` to the exact browser origin and use matching Entra redirect URIs.

## Build and rollout

1. Pass the full CI pipeline, including the native PostgreSQL service, HTTP regressions and Playwright tests.
2. Build `docker build --target runtime -t YOUR_REGISTRY/multiverse:COMMIT_SHA .` and a separate `--target migration` image. Push to the approved registry with workload federation; do not store long-lived cloud credentials in GitHub secrets when federation is available.
3. Provision the approved network, PostgreSQL, Key Vault, managed identity and Container Apps resources through your organization's reviewed infrastructure workflow. This increment does not include an untested infrastructure provisioning template.
4. Assign only required registry-pull and Key Vault secret access to the runtime identity. Use a separate database owner/migration credential and a restricted runtime database credential.
5. Run `npm run db:migrate` in the migration job. On a first deployment, run the bootstrap command from README once through a controlled job. Do not run the fictional seed in production.
6. Create a Container App revision from the runtime image. Required settings: NODE_ENV=production, AUTH_MODE=entra, PORT=4000, DATABASE_URL, APP_ORIGIN, ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET and ENTRA_REDIRECT_URI. DEV_DATABASE must be absent. Secret settings must use approved Key Vault references.
7. Configure HTTP liveness `/health/live` and readiness `/health/ready`. Test login, persistence, approval, project isolation, export authorization and logout in staging before shifting production traffic.
8. Record image digest, migration IDs, environment configuration version and release approver. Confirm company policy/workflow configuration before accepting employee submissions.

## Rollback

Retain the previous healthy Container App revision and immutable image digest. Shift traffic back if readiness, authentication, write conflicts or application errors exceed the company's approved release criteria. Never automatically reverse data migrations or delete approved history. This initial migration has no destructive downgrade. A schema-changing future release must document backward compatibility and a restore/forward-fix strategy before deployment.

## Monitoring

Observe readiness failures, 5xx counts, latency, authentication failures, approval backlogs, database saturation and transaction conflicts. Avoid logging tokens, cookies or work descriptions. Set actionable thresholds and availability objectives with stakeholders rather than inventing them. In-memory rate limiting is suitable for one replica during development; add distributed enforcement/ingress controls before multiple replicas.

## Cost drivers

Database compute/storage/HA, minimum running app replicas, private networking, registry, monitoring ingestion/retention and backup retention drive cost. No exact price is quoted without region, availability requirements and expected load. No 500-user concurrency or availability claim has been verified.

Primary references:
- https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets
- https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private
