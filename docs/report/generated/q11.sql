SELECT name, category, unit_price FROM medicines
WHERE unit_price > ALL (SELECT unit_price FROM medicines WHERE category = 'Antibiotic')
ORDER BY unit_price DESC;
SELECT name, unit_price FROM medicines
WHERE category = 'Antacid'
  AND unit_price > ANY (SELECT unit_price FROM medicines WHERE category = 'Antiplatelet');
