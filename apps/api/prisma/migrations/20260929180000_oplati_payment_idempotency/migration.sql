CREATE UNIQUE INDEX "payments_provider_transaction_id_key"
ON "payments"("provider", "provider_transaction_id");
