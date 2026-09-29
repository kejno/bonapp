CREATE UNIQUE INDEX "payments_one_pending_oplati_per_order_key"
ON "payments"("tenant_id", "order_id")
WHERE "provider" = 'OPLATI' AND "status" = 'PENDING';
