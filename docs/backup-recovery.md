# Backup and recovery runbook

Not executed. Retention, RPO, RTO, legal holds, geography and access responsibilities require company approval.

1. Enable the approved PostgreSQL Flexible Server backup retention and appropriate redundancy. Restrict restore/export authority and protect database credentials.
2. Before a migration, confirm the latest usable backup/restore point, migration compatibility and rollback plan. Back up application configuration and immutable image references separately; PostgreSQL backups do not recover Entra registrations or Key Vault configuration.
3. Restore to a new isolated non-production server using an approved restore point. Never overwrite the live database as an unreviewed first response.
4. Run the matching application image with isolated secrets and production identity access disabled for the exercise. Verify FK constraints, user/period uniqueness, snapshot counts, approval decisions, amendment lineage and append-only audit behavior.
5. Verify a known submitted and amended timesheet, report totals and sample exported CSV. Test login with dedicated staging identities and the staging registration.
6. Record observed data loss and recovery duration, compare with approved objectives, and obtain operational sign-off before any production cutover.
7. Rotate credentials if exposure is suspected. Preserve forensic/audit evidence. Update the runbook and schedule the next company-approved restore exercise.

For local experiments, `pg_dump --format=custom` and `pg_restore` can create/restore a PostgreSQL backup using secure environment-based connection configuration. Do not put credentials in command arguments. Never use a PGlite development snapshot as evidence of Azure backup recovery.
