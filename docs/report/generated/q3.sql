SELECT COUNT(*) AS bills, SUM(total_amount) AS billed, SUM(paid_amount) AS paid,
       MIN(total_amount) AS smallest, ROUND(AVG(total_amount), 2) AS average,
       MAX(total_amount) AS largest
FROM bills;
