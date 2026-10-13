SELECT medicine_id, name, stock_quantity, reorder_level
FROM medicines
WHERE stock_quantity <= reorder_level AND requires_prescription = 1;
