UPDATE tenants
SET daily_order_number_date = to_char(CURRENT_TIMESTAMP AT TIME ZONE timezone, 'YYYY-MM-DD')
WHERE daily_order_number > 0;
