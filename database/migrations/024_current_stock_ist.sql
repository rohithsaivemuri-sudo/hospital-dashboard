-- 024_current_stock_ist.sql — v_current_stock decides expiry against today's date in India.
--
-- The view compared expiry dates with CURDATE(), the MySQL server's date: on a UTC server a batch
-- expiring on the 14th was still counted usable until 05:30 IST on the 15th. A view cannot take the
-- application's date as a parameter, so it now uses DATE(UTC_TIMESTAMP() + INTERVAL 330 MINUTE), the
-- IST date whatever the server or session time zone (India has no daylight saving). The columns are
-- unchanged. Safe to re-run.

CREATE OR REPLACE VIEW v_current_stock AS
SELECT m.medicine_id, m.name, m.stock_quantity,
       COALESCE(SUM(b.quantity), 0) AS batch_total,
       COALESCE(SUM(CASE WHEN b.expiry_date >= DATE(UTC_TIMESTAMP() + INTERVAL 330 MINUTE) THEN b.quantity END), 0) AS usable_quantity,
       COALESCE(SUM(CASE WHEN b.expiry_date < DATE(UTC_TIMESTAMP() + INTERVAL 330 MINUTE) THEN b.quantity END), 0) AS expired_quantity,
       MIN(CASE WHEN b.quantity > 0 AND b.expiry_date >= DATE(UTC_TIMESTAMP() + INTERVAL 330 MINUTE) THEN b.expiry_date END) AS next_expiry
FROM medicines m
LEFT JOIN medicine_batches b ON b.medicine_id = m.medicine_id
GROUP BY m.medicine_id, m.name, m.stock_quantity;
