// Lock-order rule for the medicines table.
// Any transaction that locks more than one medicines row must take those locks one row at a
// time in ascending medicine_id order. Two transactions that both follow the rule can wait on
// each other but can never form a cycle, so InnoDB cannot deadlock them (ER_LOCK_DEADLOCK 1213).
const LOCK_MODES = { update: 'FOR UPDATE', share: 'FOR SHARE' };

async function lockMedicines(connection, medicineIds, mode = 'update') {
  const clause = LOCK_MODES[mode];
  if (!clause) throw new Error(`Unknown lock mode: ${mode}`);
  const sortedIds = [...new Set(medicineIds.map(Number))].sort((a, b) => a - b);
  const locked = new Map();
  for (const id of sortedIds) {
    const [[row]] = await connection.execute(`SELECT medicine_id, stock_quantity FROM medicines WHERE medicine_id = ? ${clause}`, [id]);
    if (row) locked.set(id, row);
  }
  return locked;
}

module.exports = { lockMedicines };
