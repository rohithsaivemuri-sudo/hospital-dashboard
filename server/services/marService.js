// Medication Administration Record: dose schedules, cancellation, and the read model.
// Every function takes the caller's transaction connection.
const { toSqlUtc, fromSqlUtc, scheduleDoses, doseState, formatIst, istDate } = require('../utils/marTime');

// After a dispense: for a patient with an ACTIVE admission, create PENDING doses for each structured,
// scheduled item (not PRN, not free-text-only). The admission row is share-locked so a concurrent
// discharge either runs first (no doses created) or waits and then cancels these doses.
async function scheduleDispensedItems(connection, { patientId, items, now }) {
  const [[admission]] = await connection.execute(
    'SELECT admission_id FROM admissions WHERE patient_id = ? AND status = "ACTIVE" ORDER BY admission_id DESC LIMIT 1 FOR SHARE', [patientId]
  );
  if (!admission) return { admissionId: null, doses: 0 };
  let doses = 0;
  for (const item of items) {
    if (!item.frequency_code || item.frequency_code === 'PRN') continue;
    const times = scheduleDoses({
      frequencyCode: item.frequency_code, durationDays: item.duration_days, quantity: item.quantity, unitsPerDose: item.units_per_dose || 1,
    }, now);
    for (const at of times) {
      await connection.execute(
        'INSERT INTO medication_administrations (prescription_item_id, patient_id, admission_id, scheduled_at_utc, status) VALUES (?, ?, ?, ?, "PENDING")',
        [item.item_id, patientId, admission.admission_id, toSqlUtc(at)]
      );
      doses += 1;
    }
  }
  return { admissionId: admission.admission_id, doses };
}

// Discharge or prescription cancellation: remaining PENDING doses become CANCELLED (not left pending).
async function cancelPendingDoses(connection, { admissionId, prescriptionId, reason, userId, now = new Date() }) {
  const where = admissionId
    ? ['admission_id = ?', admissionId]
    : ['prescription_item_id IN (SELECT item_id FROM prescription_items WHERE prescription_id = ?)', prescriptionId];
  const [result] = await connection.execute(
    `UPDATE medication_administrations SET status = 'CANCELLED', reason = ?, recorded_by = ?, recorded_at_utc = ?
     WHERE ${where[0]} AND status = 'PENDING'`,
    [reason, userId ?? null, toSqlUtc(now), where[1]]
  );
  return result.affectedRows;
}

// The MAR for one patient: dispensed items (with their structured order) and their doses, with the
// read-time state (OVERDUE when more than 60 minutes late) and IST display times.
async function loadMar(connection, patientId, now = new Date()) {
  const [items] = await connection.execute(`
    SELECT pi.item_id, pi.prescription_id, pi.medicine_id, m.name AS medicine_name, pi.dosage, pi.frequency, pi.duration,
           pi.frequency_code, pi.duration_days, pi.route, pi.units_per_dose, pi.quantity, pi.dispensed_at,
           p.status AS prescription_status, d.name AS prescriber
    FROM prescription_items pi
    JOIN prescriptions p ON p.prescription_id = pi.prescription_id
    JOIN medicines m ON m.medicine_id = pi.medicine_id
    JOIN doctors d ON d.doctor_id = p.doctor_id
    WHERE p.patient_id = ? AND pi.dispensed = TRUE
    ORDER BY pi.dispensed_at DESC, pi.item_id`, [patientId]);
  const [doses] = await connection.execute(`
    SELECT administration_id, prescription_item_id, admission_id, status, dose_given, route_given, reason,
           DATE_FORMAT(scheduled_at_utc, '%Y-%m-%d %H:%i:%s') AS scheduled_at_utc,
           DATE_FORMAT(administered_at_utc, '%Y-%m-%d %H:%i:%s') AS administered_at_utc,
           DATE_FORMAT(recorded_at_utc, '%Y-%m-%d %H:%i:%s') AS recorded_at_utc,
           u.full_name AS recorded_by_name
    FROM medication_administrations ma LEFT JOIN users u ON u.user_id = ma.recorded_by
    WHERE ma.patient_id = ?
    ORDER BY COALESCE(scheduled_at_utc, administered_at_utc), administration_id`, [patientId]);

  const byItem = new Map(items.map(i => [i.item_id, { ...i, schedule_type: i.frequency_code === 'PRN' ? 'PRN' : i.frequency_code ? 'SCHEDULED' : 'UNSCHEDULED', doses: [] }]));
  for (const d of doses) {
    const scheduled = fromSqlUtc(d.scheduled_at_utc);
    const given = fromSqlUtc(d.administered_at_utc);
    const item = byItem.get(d.prescription_item_id);
    if (!item) continue;
    item.doses.push({
      administration_id: d.administration_id,
      status: d.status,
      state: doseState(d.status, scheduled, now),
      scheduled_at: scheduled ? scheduled.toISOString() : null,
      scheduled_ist: formatIst(scheduled),
      scheduled_ist_date: scheduled ? istDate(scheduled) : given ? istDate(given) : null,
      administered_at: given ? given.toISOString() : null,
      administered_ist: formatIst(given),
      dose_given: d.dose_given, route_given: d.route_given, reason: d.reason, recorded_by_name: d.recorded_by_name,
    });
  }
  return { now: now.toISOString(), now_ist: formatIst(now), today_ist: istDate(now), items: [...byItem.values()] };
}

module.exports = { scheduleDispensedItems, cancelPendingDoses, loadMar };
