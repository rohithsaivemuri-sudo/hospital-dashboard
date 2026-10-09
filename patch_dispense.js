const fs = require('fs');
let code = fs.readFileSync('server/controllers/prescriptionController.js', 'utf8');

const replacement = `
    // Update items first to trigger stock reduction (actually wait, let's insert into pharmacy_stock_movements manually because the trigger only updates stock_quantity but doesn't log movement)
    await connection.execute('UPDATE prescription_items SET dispensed = TRUE, dispensed_at = NOW() WHERE prescription_id = ? AND dispensed = FALSE', [req.params.id]);
    
    // Log movements
    for (const item of items) {
      await connection.execute('INSERT INTO pharmacy_stock_movements (medicine_id, movement_type, quantity, reason, reference_id, performed_by) VALUES (?, "DISPENSE", ?, "Dispense Prescription", ?, ?)', [item.medicine_id, -item.quantity, req.params.id, req.user.user_id]);
    }
    
    // Then update prescription status
`;

code = code.replace(
  "// Update items first to trigger stock reduction\n    await connection.execute('UPDATE prescription_items SET dispensed = TRUE WHERE prescription_id = ? AND dispensed = FALSE', [req.params.id]);\n    \n    // Then update prescription status",
  replacement
);

fs.writeFileSync('server/controllers/prescriptionController.js', code);
console.log("Patched dispense logic");
