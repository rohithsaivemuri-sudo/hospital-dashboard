SELECT b.bed_number, b.bed_type, w.name AS ward, w.floor
FROM beds b JOIN wards w ON w.ward_id = b.ward_id
WHERE b.status = 'AVAILABLE' AND b.bed_type IN ('ICU', 'VENTILATOR_ICU')
ORDER BY w.name, b.bed_number;
