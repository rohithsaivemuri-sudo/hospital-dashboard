SELECT dep.name AS department, COUNT(*) AS doctors,
       SUM(doc.max_workload) AS capacity
FROM doctors doc JOIN departments dep ON dep.department_id = doc.department_id
GROUP BY dep.department_id, dep.name
HAVING COUNT(*) > 1
ORDER BY doctors DESC, department;
