const fs = require('fs');
let code = fs.readFileSync('client/src/pages/Patients/PatientDetail.jsx', 'utf8');

// Replace state
code = code.replace(
  "const [selectedTestId, setSelectedTestId] = useState('');",
  "const [selectedTests, setSelectedTests] = useState([]);\n  const [currentTestId, setCurrentTestId] = useState('');"
);

// Replace handleOrderLab
code = code.replace(
  /const handleOrderLab = async \(e\) => \{[\s\S]*?fetchPatientData\(\); \/\/ Refresh history\n    \} catch \(err\) \{/,
  `const handleAddTest = () => {
    if (!currentTestId) return;
    const testObj = labTests.find(t => t.test_id == currentTestId);
    setSelectedTests([...selectedTests, { test_id: currentTestId, name: testObj?.name }]);
    setCurrentTestId('');
  };

  const handleOrderLab = async (e) => {
    e.preventDefault();
    if (selectedTests.length === 0) return toast.error("Add at least one test");
    try {
      await createLabOrder({
        patient_id: id,
        doctor_id: user.doctor_id,
        tests: selectedTests.map(t => ({ test_id: t.test_id })),
        notes: labNotes
      });
      toast.success('Lab tests ordered successfully');
      setShowLabModal(false);
      setSelectedTests([]);
      setLabNotes('');
      fetchPatientData(); // Refresh history
    } catch (err) {`
);

// Replace Lab Order Modal UI
const modalRegex = /\{\/\* Lab Order Modal \*\/\}([\s\S]*?)\{\/\* Prescription Modal \*\/\}/;
const newModal = `{/* Lab Order Modal */}
      {showLabModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius)', width: '500px' }}>
            <h2 style={{ marginTop: 0 }}>ORDER LAB TESTS</h2>
            <p><strong>Patient:</strong> {patient.name}</p>
            
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={currentTestId} onChange={(e) => setCurrentTestId(e.target.value)} style={{ flex: 1, padding: '8px' }}>
                  <option value="">-- Choose a Test --</option>
                  {labTests.map(t => (
                    <option key={t.test_id} value={t.test_id}>{t.name} (₹{t.price})</option>
                  ))}
                </select>
                <button type="button" onClick={handleAddTest} style={{ padding: '8px 16px', background: 'var(--secondary)', color: 'white', border: 'none', borderRadius: '4px' }}>+ Add Test</button>
              </div>
            </div>

            {selectedTests.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: '16px' }}>
                {selectedTests.map((t, idx) => (
                  <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f1f5f9', marginBottom: '4px', borderRadius: '4px' }}>
                    <span>{t.name}</span>
                    <button onClick={() => setSelectedTests(selectedTests.filter((_, i) => i !== idx))} style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Remove</button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleOrderLab}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>Clinical Notes</label>
                <textarea value={labNotes} onChange={(e) => setLabNotes(e.target.value)} style={{ width: '100%', padding: '8px', height: '60px' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setShowLabModal(false)} style={{ padding: '8px 16px' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px' }}>Order Tests</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Prescription Modal */}`;

code = code.replace(modalRegex, newModal);
fs.writeFileSync('client/src/pages/Patients/PatientDetail.jsx', code);
