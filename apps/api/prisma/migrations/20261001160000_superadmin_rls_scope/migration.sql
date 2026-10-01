-- SuperAdmin access is granted only inside an API transaction that sets this
-- transaction-local scope after JWT authentication and role verification.
CREATE POLICY superadmin_tenant_read ON "tenants"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (current_setting('app.current_scope', true) = 'superadmin');

CREATE POLICY superadmin_tenant_update ON "tenants"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (current_setting('app.current_scope', true) = 'superadmin')
  WITH CHECK (current_setting('app.current_scope', true) = 'superadmin');

CREATE POLICY superadmin_access ON "orders"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (current_setting('app.current_scope', true) = 'superadmin');
