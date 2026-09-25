-- Add BILL_REQUESTED to TableStatus enum for tracking tables awaiting payment.
-- Required by the DELETE /tables/:id guard (blocks deletion while table has an active status)
-- and the PATCH /tables/:id/status endpoint.
ALTER TYPE "TableStatus" ADD VALUE 'BILL_REQUESTED';
