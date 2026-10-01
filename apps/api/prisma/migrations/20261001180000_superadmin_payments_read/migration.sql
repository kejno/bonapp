-- SuperAdmin payment access is limited to transactions that set this scope.
CREATE POLICY superadmin_payment_read ON "payments"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (current_setting('app.current_scope', true) = 'superadmin');
