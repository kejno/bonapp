ALTER TABLE "shifts" ADD COLUMN "skno_start_z" INTEGER;
ALTER TABLE "shift_reports" ADD COLUMN "z_report_number" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "shifts" ADD COLUMN "skno_close_started_at" TIMESTAMP(3);
