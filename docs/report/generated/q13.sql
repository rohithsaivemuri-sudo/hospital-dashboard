SELECT bed_type, COUNT(*) AS beds,
       SUM(status = 'OCCUPIED') AS occupied,
       ROUND(100 * SUM(status = 'OCCUPIED') / COUNT(*), 1) AS occupancy_pct
FROM beds
GROUP BY bed_type
ORDER BY occupancy_pct DESC;
