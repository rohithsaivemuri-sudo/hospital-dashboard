SELECT name, category, unit_price
FROM medicines
WHERE unit_price > (SELECT AVG(unit_price) FROM medicines)
ORDER BY unit_price DESC
LIMIT 6;
