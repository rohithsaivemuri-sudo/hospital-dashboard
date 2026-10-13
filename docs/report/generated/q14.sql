SELECT name, stock_quantity, usable_quantity, next_expiry
FROM v_current_stock
WHERE usable_quantity > 0
ORDER BY next_expiry, name
LIMIT 6;
