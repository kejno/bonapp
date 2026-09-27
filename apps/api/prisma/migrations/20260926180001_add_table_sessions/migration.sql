CREATE TABLE "table_sessions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "table_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "table_sessions_token_hash_key" ON "table_sessions"("token_hash");
CREATE INDEX "table_sessions_tenant_id_table_id_expires_at_idx" ON "table_sessions"("tenant_id", "table_id", "expires_at");
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_id_tenant_id_fkey"
  FOREIGN KEY ("table_id", "tenant_id") REFERENCES "tables"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "table_sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "table_sessions_tenant_isolation" ON "table_sessions"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true));
