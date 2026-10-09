// Dispensing a prescription inside the caller's transaction. Used by
// POST /api/prescriptions/:id/dispense and by the demo-data migration, so both follow one path.
// Returns { status, body }. Any non-200 result means nothing should be committed: the caller rolls back.
const { lockMedicines } = require('../utils/medicineLocks');
const { lockBatches, allocate, decrementBatches } = require('../utils/batches');
const { writeAudit } = require('../utils/audit');
const { scheduleDispensedItems } = require('./marService');

async function dispensePrescription(connection, req, prescriptionId, { now = new Date() } = {}) {
  const [[prescription]] = await connection.execute('SELECT status, patient_id FROM prescriptions WHERE prescription_id = ? FOR UPDATE', [prescriptionId]);
  if (!prescription || prescription.status === 'DISPENSED' || prescription.status === 'CANCELLED') {
    return { status: 409, body: { success: false, message: 'Prescription is not available for dispensing' } };
  }
  // Plain (non-locking) read: the prescriptions row lock above already serialises every
  // dispenser of this prescription, and nothing else modifies its items. A locking read here
  // would take gap locks on the prescription_items index ahead of the medicines locks, which
  // can deadlock with a concurrent prescription create (medicines locks, then item inserts).
  const [items] = await connection.execute(
    `SELECT item_id, medicine_id, quantity, frequency_code, duration_days, units_per_dose
     FROM prescription_items WHERE prescription_id = ? AND dispensed = FALSE`,
    [prescriptionId]
  );
  if (!items.length) return { status: 409, body: { success: false, message: 'No remaining items to dispense' } };

  // Deadlock prevention: total the quantity per medicine, then lock the medicines rows in
  // ascending medicine_id order (see utils/medicineLocks.js) before checking stock.
  const required = new Map();
  for (const item of items) required.set(item.medicine_id, (required.get(item.medicine_id) || 0) + item.quantity);
  const locked = await lockMedicines(connection, [...required.keys()]);

  // FEFO: for each medicine (same ascending order) lock its unexpired batches, earliest expiry
  // first, and allocate each item's quantity across them. Expired stock is never dispensed.
  const allocations = new Map(); // item_id -> [{ batch_id, batch_number, quantity }]
  for (const medicineId of [...required.keys()].sort((a, b) => a - b)) {
    const medicine = locked.get(medicineId);
    const batches = medicine ? await lockBatches(connection, medicineId, { usableOnly: true }) : [];
    const usable = batches.reduce((sum, b) => sum + b.quantity, 0);
    if (!medicine || medicine.stock_quantity < required.get(medicineId) || usable < required.get(medicineId)) {
      return { status: 400, body: { success: false, message: `Insufficient Stock for Medicine ID ${medicineId}`, available_unexpired: usable } };
    }
    for (const item of items.filter(i => i.medicine_id === medicineId).sort((a, b) => a.item_id - b.item_id)) {
      allocations.set(item.item_id, allocate(batches, item.quantity));
    }
  }

  // Update by primary key so only these item records are locked (no index gap locks).
  // The after_prescription_dispense trigger decrements medicines.stock_quantity per item; the
  // same quantities come off the batches below, keeping the total equal to the sum of batches.
  const itemIds = items.map(item => item.item_id);
  const [updated] = await connection.query('UPDATE prescription_items SET dispensed = TRUE, dispensed_at = NOW() WHERE item_id IN (?) AND dispensed = FALSE', [itemIds]);
  if (updated.affectedRows !== itemIds.length) {
    return { status: 409, body: { success: false, message: 'Prescription is not available for dispensing' } };
  }

  // Take stock off the batches, record which batches each item came from, and log one movement
  // per item and batch.
  for (const item of items) {
    const taken = allocations.get(item.item_id);
    await decrementBatches(connection, taken);
    for (const t of taken) {
      await connection.execute('INSERT INTO prescription_item_batches (item_id, batch_id, quantity) VALUES (?, ?, ?)', [item.item_id, t.batch_id, t.quantity]);
      await connection.execute('INSERT INTO pharmacy_stock_movements (medicine_id, movement_type, quantity, reason, reference_id, performed_by, batch_id) VALUES (?, "DISPENSE", ?, "Dispense Prescription", ?, ?, ?)', [item.medicine_id, -t.quantity, prescriptionId, req.user.user_id, t.batch_id]);
    }
  }

  // Admitted patients: put the scheduled doses on the ward's medication record.
  const mar = await scheduleDispensedItems(connection, { patientId: prescription.patient_id, items, now });

  await connection.execute('UPDATE prescriptions SET status = "DISPENSED" WHERE prescription_id = ?', [prescriptionId]);
  await writeAudit(connection, req, { action: 'DISPENSE_PRESCRIPTION', entityType: 'prescription', entityId: Number(prescriptionId), patientId: prescription.patient_id,
    details: { from: prescription.status, to: 'DISPENSED', doses_scheduled: mar.doses,
      items: items.map(item => ({ item_id: item.item_id, medicine_id: item.medicine_id, quantity: item.quantity, batches: allocations.get(item.item_id).map(t => ({ batch_id: t.batch_id, quantity: t.quantity })) })) } });

  return { status: 200, body: { success: true, message: 'Dispensed successfully', doses_scheduled: mar.doses } };
}

module.exports = { dispensePrescription };
