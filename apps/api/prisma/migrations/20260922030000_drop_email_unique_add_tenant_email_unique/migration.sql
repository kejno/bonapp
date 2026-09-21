-- Email addresses are unique within a tenant, not across all tenants.

DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");
