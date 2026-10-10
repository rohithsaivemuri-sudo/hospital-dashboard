// Medicine batches and First-Expired-First-Out allocation (report Section F.3).
//
// Invariant: medicines.stock_quantity = SUM(medicine_batches.quantity) for every medicine, kept in
// the same transaction as every stock change (receipt, adjustment, dispense).
//
// Lock order: the caller must already hold the medicines row lock (utils/medicineLocks.js, ascending
// medicine_id). Batches are then locked per medicine in FEFO order through
// idx_medicine_batches_fefo (medicine_id, expiry_date, batch_id). Every writer of batches follows
// medicines -> batches, so batch locks never form a cycle.

// Locks a medicine's batches with stock, earliest expiry first. usableOnly skips expired batches
// (dispensing); adjustments see every batch so expired stock can be written off.
async function lockBatches(connection, medicineId, { usableOnly }) {
  const [rows] = await connection.execute(
    `SELECT batch_id, batch_number, quantity, expiry_date FROM medicine_batches
     WHERE medicine_id = ? AND quantity > 0 ${usableOnly ? 'AND expiry_date >= CURDATE()' : ''}
     ORDER BY expiry_date, batch_id FOR UPDATE`,
    [medicineId]
  );
  return rows;
}

// Takes `quantity` from `batches` in the order given; null when they hold too little.
function allocate(batches, quantity) {
  const taken = [];
  let remaining = quantity;
  for (const batch of batches) {
    if (remaining === 0) break;
    const available = batch.quantity - (batch.allocated || 0);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    batch.allocated = (batch.allocated || 0) + take;
    taken.push({ batch_id: batch.batch_id, batch_number: batch.batch_number, quantity: take });
    remaining -= take;
  }
  return remaining === 0 ? taken : null;
}

async function decrementBatches(connection, allocations) {
  for (const a of allocations) {
    await connection.execute('UPDATE medicine_batches SET quantity = quantity - ? WHERE batch_id = ?', [a.quantity, a.batch_id]);
  }
}

module.exports = { lockBatches, allocate, decrementBatches };
