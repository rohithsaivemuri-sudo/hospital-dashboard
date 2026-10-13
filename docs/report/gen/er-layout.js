// Positions (cm, y down is negative) for each Chen diagram. One diagram = one page or less.
// entities: own entities with attribute positions, or { ref: true } for an entity of another
// module (or another page of the same module). rels: diamond positions, optional via points,
// anchors and cardinality-label positions, and relationship attribute positions.
const diagrams = {};

// ---------- Module 1, page 1: patients, appointments, visits
diagrams['1a'] = {
  module: 1,
  entities: {
    PATIENT: { at: [4.4, -9.2], attrs: {
      patient_id: [1.3, -8.2], name: [1.2, -9.4], gender: [1.4, -10.6], phone: [1.6, -11.7],
      date_of_birth: [2.0, -6.9], age: [4.0, -6.6], allergies: [1.0, -7.4 - 0.1], abha_number: [3.3, -5.7] } },
    APPOINTMENT: { at: [8.6, -2.4], attrs: {
      appointment_id: [5.6, -1.0], slot: [8.6, -0.6], 'slot.appointment_date': [6.9, 0.3], 'slot.appointment_time': [10.3, 0.3],
      status: [11.6, -1.0], reason: [5.6, -2.4] } },
    ENCOUNTER: { at: [13.4, -9.2], attrs: {
      encounter_id: [15.5, -6.9], encounter_type: [16.0, -8.1], status: [16.0, -9.4], timeline: [15.9, -10.7],
      'timeline.arrived_at': [14.4, -11.3], 'timeline.start_timestamp': [16.1, -11.9], 'timeline.end_timestamp': [14.9, -12.6] } },
    DOCTOR: { ref: true, at: [14.6, -2.4] },
    USER: { ref: true, at: [11.2, -6.0] },
    PRESCRIPTION: { ref: true, at: [8.6, -13.2] },
    SURGERY_REQUEST: { ref: true, at: [8.6, -15.6] },
    LAB_ORDER: { ref: true, at: [8.6, -18.0] },
    ADMISSION: { ref: true, at: [8.6, -20.6] },
    BILL: { ref: true, at: [1.4, -15.0] },
    EMERGENCY_CASE: { ref: true, at: [1.6, -17.6] },
    BED: { ref: true, at: [3.4, -22.6] },
  },
  rels: {
    BOOKS: [6.3, -5.4],
    BECOMES: { at: [11.6, -4.0] },
    ATTENDS: [11.6, -2.4],
    CONDUCTS: { at: [14.6, -5.6] },
    VISITS: [8.6, -9.2],
    OPENS: { at: [12.0, -7.4] },
    PRESCRIBED: { at: [5.6, -13.2], anchor: { PATIENT: 'south east' } }, SURGERY_OF: { at: [5.6, -15.6], anchor: { PATIENT: '-60' } }, TESTED: { at: [5.6, -18.0], anchor: { PATIENT: '-70' } }, ADMITTED: { at: [5.6, -20.6], anchor: { PATIENT: '-80' } },
    RX_IN: { at: [11.6, -13.2], anchor: { ENCOUNTER: 'south west' } }, SURGERY_IN: { at: [11.6, -15.6], anchor: { ENCOUNTER: '-120' } }, LAB_IN: { at: [11.6, -18.0], anchor: { ENCOUNTER: '-110' } }, STAY_VISIT: { at: [11.6, -20.6], anchor: { ENCOUNTER: '-100' } },
    BILLED: { at: [3.4, -13.6], anchor: { PATIENT: 'south west' } },
    ARRIVES: { at: [3.4, -16.2], anchor: { PATIENT: '-115' } },
    OCCUPIES: { at: [6.8, -22.6], from: { PATIENT: 'west' }, via: { PATIENT: [[4.4, -21.3]] }, attrs: { assigned_at: [9.2, -23.1], released_at: [11.4, -22.4], status: [5.0, -23.6] } },
  },
};

// ---------- Module 1, page 2: vital signs and consultations
const M1 = 'Module 1, page 1';
diagrams['1b'] = {
  module: 1,
  yscale: 0.72,
  entities: {
    VITAL_SIGN: { at: [3.2, -9.2], attrs: {
      vital_id: [1.1, -11.0], recorded_at_utc: [1.4, -12.1], pulse_bpm: [3.6, -12.4], temperature_c: [1.0, -9.9], spo2_pct: [1.0, -7.9],
      blood_pressure: [3.0, -14.0], 'blood_pressure.bp_systolic': [1.8, -15.2], 'blood_pressure.bp_diastolic': [4.3, -15.2] } },
    CONSULTATION: { at: [13.8, -9.2], attrs: {
      consultation_id: [16.2, -10.4], consultation_time: [16.0, -11.5], symptoms: [16.2, -9.2], diagnosis: [16.2, -12.6], plan: [15.9, -13.7] } },
    PATIENT: { ref: true, see: M1, at: [8.5, -4.2] },
    ENCOUNTER: { ref: true, see: M1, at: [8.5, -9.2] },
    APPOINTMENT: { ref: true, see: M1, at: [13.8, -1.4] },
    ADMISSION: { ref: true, at: [8.5, -15.0] },
    USER: { ref: true, at: [3.2, -1.4] },
    DOCTOR: { ref: true, at: [16.2 - 0.9, -4.6] },
    PRESCRIPTION: { ref: true, at: [11.0, -18.4] },
    LAB_ORDER: { ref: true, at: [15.2, -18.4] },
  },
  rels: {
    RECORDS: [3.2, -5.0],
    MEASURED: [5.8, -6.3],
    TAKEN_IN: [5.8, -9.2],
    TAKEN_ON: [5.8, -13.2],
    NOTE_OF: [11.2, -6.3],
    NOTE_IN: [11.2, -9.2],
    STAY_NOTE: [11.2, -13.2],
    NOTE_FOR: [13.8, -4.2],
    WRITES: { at: [16.1, -7.0 + 0.6] },
    RX_FROM: [12.0, -15.6],
    LAB_FROM: [15.2, -15.6],
  },
};

// ---------- Module 2: clinical orders
diagrams['2'] = {
  module: 2,
  entities: {
    PRESCRIPTION: { at: [3.6, -7.4], attrs: { prescription_id: [1.1, -6.2], prescription_date: [1.2, -8.6], status: [1.3, -9.7], notes: [1.0, -7.4] } },
    PRESCRIPTION_ITEM: { at: [3.6, -13.6], attrs: { item_id: [1.0, -12.4], dosage: [1.0, -13.6], frequency_code: [1.3, -14.8], quantity: [1.4, -15.9], dispensed: [6.0, -15.2], dispensed_at: [6.4, -16.2] } },
    MED_ADMINISTRATION: { at: [13.2, -13.6], attrs: { administration_id: [15.6, -12.2], scheduled_at_utc: [15.9, -13.4], status: [15.9, -14.6], dose_given: [15.5, -15.7], route_given: [11.0, -15.4] } },
    SURGERY_REQUEST: { at: [14.6, -4.6], attrs: { request_id: [13.4, -1.2], procedure_name: [15.7, -1.9], priority: [16.0, -6.4], status: [14.6, -7.4] } },
    PATIENT: { ref: true, at: [9.0, -2.0] },
    DOCTOR: { ref: true, at: [9.0, -4.6] },
    ENCOUNTER: { ref: true, at: [9.0, -7.2] },
    CONSULTATION: { ref: true, at: [2.0, -1.6] },
    ADMISSION: { ref: true, at: [9.0, -10.6] },
    MEDICINE: { ref: true, at: [2.6, -21.0] },
    MEDICINE_BATCH: { ref: true, at: [8.2, -21.0] },
    USER: { ref: true, at: [13.2, -21.0] },
  },
  rels: {
    PRESCRIBED: { at: [6.2, -2.0], anchor: { PRESCRIPTION: '75' } },
    PRESCRIBES: { at: [6.2, -4.6], anchor: { PRESCRIPTION: 'north east' } },
    RX_IN: { at: [6.2, -7.2] },
    RX_FROM: { at: [2.4, -4.3], anchor: { PRESCRIPTION: '110' } },
    STAY_RX: { at: [6.2, -9.8], anchor: { PRESCRIPTION: 'south east' } },
    SURGERY_OF: { at: [11.8, -2.0], anchor: { SURGERY_REQUEST: 'north west' } },
    REQUESTS: { at: [11.8, -4.6] },
    SURGERY_IN: { at: [11.8, -7.2], anchor: { SURGERY_REQUEST: 'south west' } },
    LISTS: { at: [3.6, -10.6] },
    GIVEN_AS: { at: [8.4, -13.6] },
    STAY_DOSE: { at: [11.6, -10.6], anchor: { MED_ADMINISTRATION: 'north west' } },
    GIVEN_BY: { at: [13.2, -18.3] },
    OF_DRUG: { at: [2.6, -18.6], anchor: { PRESCRIPTION_ITEM: '-110' } },
    FILLED_FROM: { at: [6.8, -18.2], anchor: { PRESCRIPTION_ITEM: 'south east' }, attrs: { quantity: [9.0, -17.4] } },
  },
};

// ---------- Module 3: pharmacy
diagrams['3'] = {
  module: 3,
  yscale: 0.7,
  entities: {
    MEDICINE: { at: [6.0, -4.0], attrs: { medicine_id: [3.4, -2.6], name: [4.4, -1.4], category: [6.4, -1.0], unit_price: [8.6, -1.6], reorder_level: [9.6, -2.8], stock_quantity: [3.3, -5.0] } },
    MEDICINE_BATCH: { at: [6.0, -11.0], attrs: { batch_number: [3.0, -12.4], quantity: [4.0, -13.6], expiry_date: [6.0, -14.0], received_date: [3.3, -10.0] } },
    STOCK_MOVEMENT: { at: [13.2, -11.0], attrs: { movement_id: [15.6, -9.4], movement_type: [16.0, -10.6], quantity: [16.0, -11.8], reason: [15.6, -13.0], created_at: [15.4, -8.3] } },
    PRESCRIPTION_ITEM: { ref: true, at: [1.4, -7.6] },
    USER: { ref: true, at: [11.0, -16.0] },
  },
  rels: {
    HAS_BATCH: { at: [6.0, -7.5] },
    MOVES: { at: [11.2, -6.4] },
    FROM_BATCH: { at: [9.6, -11.0] },
    OF_DRUG: { at: [1.6, -4.0], anchor: { MEDICINE: 'west' } },
    FILLED_FROM: { at: [1.6, -11.0], anchor: { MEDICINE_BATCH: 'west' }, attrs: { quantity: [1.4, -12.6] } },
    RECEIVES: { at: [8.0, -14.2], anchor: { MEDICINE_BATCH: 'south east' } },
    PERFORMS: { at: [13.2, -14.0] },
  },
};

// ---------- Module 4: laboratory
diagrams['4'] = {
  module: 4,
  entities: {
    LAB_TEST: { at: [2.8, -8.6], attrs: { test_id: [1.1, -10.6], name: [2.6, -11.4], cost: [4.3, -10.9], unit: [1.0, -6.8], reference_range: [3.0, -13.0], 'reference_range.reference_low': [1.6, -14.2], 'reference_range.reference_high': [4.4, -14.2] } },
    LAB_ORDER: { at: [8.6, -8.6], attrs: { order_id: [6.3, -6.4], order_date: [7.4, -5.3], status: [9.2, -5.2], priority: [6.1, -7.5] } },
    LAB_RESULT: { at: [8.6, -15.0], attrs: { result_id: [5.8, -14.0], result_value: [5.6, -15.2], numeric_value: [5.9, -16.4], interpretation: [10.9, -13.9], result_date: [11.2, -15.0] } },
    LAB_ATTACHMENT: { at: [4.6, -20.4], attrs: { attachment_id: [1.6, -19.4], original_filename: [1.8, -21.5], mime_type: [4.6, -22.2], file_size: [2.0, -20.4] } },
    DEPARTMENT: { ref: true, at: [2.8, -2.2] },
    PATIENT: { ref: true, at: [15.3, -2.6] },
    DOCTOR: { ref: true, at: [15.3, -5.6] },
    ENCOUNTER: { ref: true, at: [15.3, -8.6] },
    CONSULTATION: { ref: true, at: [15.3, -11.6] },
    ADMISSION: { ref: true, at: [15.3, -14.6] },
    USER: { ref: true, at: [12.6, -20.4] },
  },
  rels: {
    OF_TEST: { at: [5.7, -8.6] },
    OFFERS: { at: [2.8, -5.1] },
    TESTED: { at: [12.3, -2.6], anchor: { LAB_ORDER: 'north east' } },
    ORDERS: { at: [12.3, -5.6], anchor: { LAB_ORDER: '20' } },
    LAB_IN: { at: [12.3, -8.6] },
    LAB_FROM: { at: [12.3, -11.6], anchor: { LAB_ORDER: '-20' } },
    STAY_LAB: { at: [12.3, -14.6], anchor: { LAB_ORDER: 'south east' }, cardpos: { LAB_ORDER: 0.8 } },
    YIELDS: { at: [8.6, -11.8] },
    ANALYSES: { at: [11.6, -17.8], anchor: { LAB_RESULT: 'south east' } },
    ATTACHED: { at: [6.6, -17.8], anchor: { LAB_RESULT: 'south west' } },
    UPLOADS: { at: [8.6, -20.4] },
  },
};

// ---------- Module 5, page 1: wards, beds, admissions and emergencies
const M5 = 'Module 5, page 1';
diagrams['5a'] = {
  module: 5,
  entities: {
    WARD: { at: [3.4, -4.4], attrs: { ward_id: [1.0, -3.0], name: [1.0, -4.2], floor: [1.0, -5.4], capacity: [2.6, -6.4], ward_type: [4.6, -6.4] } },
    BED: { at: [3.4, -11.0], attrs: { bed_number: [1.0, -9.6], bed_type: [1.0, -10.8], status: [1.0, -12.0], has_ventilator: [1.3, -13.2] } },
    ADMISSION: { at: [11.2, -11.0], attrs: { admission_id: [12.8, -8.4], admission_date: [15.9, -9.4], discharge_date: [16.0, -10.5], status: [15.8, -11.6], diagnosis: [14.6, -8.2] } },
    EMERGENCY_CASE: { at: [11.2, -18.6], attrs: { emergency_id: [15.7, -17.9], severity: [15.9, -19.0], arrival_time: [15.6, -20.1], status: [14.4, -21.1],
      requirements: [11.2, -21.2], 'requirements.required_bed_type': [8.6, -22.2], 'requirements.required_specialization': [11.4, -22.8], 'requirements.ventilator_required': [14.4, -22.2] } },
    AMBULANCE: { at: [3.4, -21.2], attrs: { ambulance_id: [1.0, -19.8], vehicle_number: [1.2, -22.6], status: [3.4, -23.2], driver: [5.4, -23.0], 'driver.driver_name': [4.4, -24.1], 'driver.driver_phone': [6.6, -24.1] } },
    DEPARTMENT: { ref: true, at: [11.2, -4.4] },
    WARD_ASSIGNMENT: { ref: true, at: [3.4, -0.6] },
    PATIENT: { ref: true, at: [7.2, -15.4] },
    DOCTOR: { ref: true, at: [15.4, -14.8] },
  },
  rels: {
    COVERS: { at: [3.4, -2.4] },
    HAS_BED: { at: [3.4, -7.8] },
    IN_DEPT: { at: [7.3, -4.4] },
    ADMITTED_TO: { at: [11.2, -7.6] },
    ALLOCATED: { at: [7.3, -10.0], anchor: { BED: 'north east', ADMISSION: 'north west' } },
    OCCUPIES: { at: [7.3, -12.6], anchor: { BED: 'south east', ADMISSION: 'south west' }, attrs: { assigned_at: [4.9, -13.8], released_at: [4.9, -14.9], status: [4.9, -12.7] } },
    ADMITTED: { at: [9.6, -14.5], anchor: { ADMISSION: '-120', PATIENT: 'east' } },
    RESULTS_IN: { at: [12.0, -15.0], anchor: { ADMISSION: '-75', EMERGENCY_CASE: '75' } },
    ADMITS: { at: [14.0, -13.4], anchor: { ADMISSION: '-30' } },
    ARRIVES: { at: [9.0, -17.2], anchor: { EMERGENCY_CASE: 'north west' } },
    ASSIGNED: { at: [14.2, -16.6], anchor: { EMERGENCY_CASE: 'north east' } },
    GIVEN_BED: { at: [3.4, -16.4], anchor: { EMERGENCY_CASE: 'west', BED: 'south' }, via: { EMERGENCY_CASE: [[6.0, -18.6]] } },
    CARRIES: { at: [7.4, -21.2], anchor: { EMERGENCY_CASE: 'south west' } },
  },
};
// The occupancy diamond's own status attribute sits below it; nudge the patient link off it.
diagrams['5a'].entities.PATIENT.at = [7.3, -15.9];

// ---------- Module 5, page 2: what an admission covers, and billing
diagrams['5b'] = {
  module: 5,
  entities: {
    ADMISSION: { ref: true, see: M5, at: [8.5, -7.6] },
    BILL: { at: [8.5, -14.4], attrs: { bill_id: [11.0, -12.9], bill_date: [12.2, -13.9], total_amount: [12.4, -15.0], paid_amount: [5.6, -15.6], status: [5.8, -13.2] } },
    BILL_ITEM: { at: [8.5, -20.6], attrs: { item_id: [5.6, -19.4], description: [5.4, -20.6], category: [5.8, -21.8], quantity: [11.4, -19.4], unit_price: [11.8, -20.6], total_price: [11.4, -21.8] } },
    ENCOUNTER: { ref: true, at: [1.6, -2.6] },
    VITAL_SIGN: { ref: true, at: [1.6, -7.6] },
    CONSULTATION: { ref: true, at: [1.6, -12.6] },
    PRESCRIPTION: { ref: true, at: [15.4, -2.6] },
    MED_ADMINISTRATION: { ref: true, at: [15.2, -7.6] },
    LAB_ORDER: { ref: true, at: [15.4, -12.6] },
    PATIENT: { ref: true, at: [15.4, -17.4] },
  },
  rels: {
    STAY_VISIT: { at: [4.8, -2.6], anchor: { ADMISSION: 'north west' } },
    TAKEN_ON: { at: [4.8, -7.6] },
    STAY_NOTE: { at: [4.8, -12.6], anchor: { ADMISSION: 'south west' } },
    STAY_RX: { at: [12.2, -2.6], anchor: { ADMISSION: 'north east' } },
    STAY_DOSE: { at: [12.0, -7.6] },
    STAY_LAB: { at: [12.2, -12.6], anchor: { ADMISSION: 'south east' } },
    STAY_BILL: { at: [8.5, -11.0] },
    BILLED: { at: [12.6, -17.4], anchor: { BILL: 'south' }, via: { BILL: [[8.9, -17.4]] } },
    ITEMISES: { at: [8.5, -17.6] },
  },
};

// ---------- Module 6, page 1: staff accounts, doctors, departments, assignments, audit
const M6 = 'Module 6, page 1';
diagrams['6a'] = {
  module: 6,
  entities: {
    USER: { at: [5.0, -3.4], attrs: { user_id: [2.4, -1.4], username: [4.2, -0.8], role: [6.0, -0.8], full_name: [7.6, -1.4], email: [2.2, -4.6] } },
    WARD_ASSIGNMENT: { at: [13.2, -3.4], attrs: { assignment_id: [15.4, -1.4], start_date: [12.4, -1.0], end_date: [15.6, -4.6], ended_at: [16.4, -3.0] } },
    AUDIT_LOG: { at: [2.4, -10.6], attrs: { audit_id: [0.9, -12.4], action: [2.4, -13.0], outcome: [4.0, -12.6], created_at: [0.9, -8.8], details: [4.4, -9.2 + 0.2] } },
    DOCTOR: { at: [7.8, -10.6], attrs: { doctor_id: [6.0, -8.6], specialization: [9.6, -8.6], shift: [5.2, -11.9], max_workload: [6.4, -12.9], current_workload: [11.2, -10.6] } },
    DEPARTMENT: { at: [13.2, -14.6], attrs: { department_id: [15.6, -13.2], name: [15.8, -14.4], floor: [15.6, -15.6], phone: [13.6, -16.6] } },
    DOCTOR_SCHEDULE: { at: [3.6, -18.4], attrs: { day_of_week: [1.4, -17.0], start_time: [1.2, -18.4], end_time: [1.4, -19.8], is_available: [3.6, -20.4] } },
    DAILY_ANALYTICS: { at: [8.6, -20.6], attrs: { analytics_date: [6.4, -22.0], patients_seen: [8.6, -22.6], cases_pending: [10.8, -22.0] } },
    WARD: { ref: true, at: [13.2, -9.0] },
    LAB_TEST: { ref: true, at: [15.4, -20.4] },
    ADMISSION: { ref: true, at: [11.6, -20.4] },
  },
  rels: {
    NURSE_OF: { at: [9.1, -2.4], anchor: { USER: 'north east', WARD_ASSIGNMENT: 'north west' } },
    ASSIGNS: { at: [9.1, -4.4], anchor: { USER: 'south east', WARD_ASSIGNMENT: 'south west' } },
    COVERS: { at: [13.2, -6.2] },
    IN_DEPT: { at: [13.2, -11.8] },
    LOGS: { at: [2.4, -6.8], anchor: { USER: 'south west' } },
    IS_DOCTOR: { at: [6.6, -6.8], anchor: { USER: 'south' } },
    WORKS_IN: { at: [10.6, -13.6], anchor: { DOCTOR: 'south east', DEPARTMENT: 'west' } },
    HAS_SLOT: { at: [5.4, -15.4], anchor: { DOCTOR: 'south west' } },
    HAS_STATS: { at: [8.4, -16.6], anchor: { DOCTOR: 'south' } },
    OFFERS: { at: [15.4, -17.6], anchor: { DEPARTMENT: 'south east' } },
    ADMITTED_TO: { at: [11.6, -17.6], anchor: { DEPARTMENT: 'south west' } },
  },
};

// ---------- Module 6, page 2: what doctors and staff accounts are linked to
diagrams['6b'] = (() => {
  const D = [6.2, -11.6], U = [10.8, -11.6];
  const ray = (c, deg, a, b) => [+(c[0] + a * Math.cos(deg * Math.PI / 180)).toFixed(2), +(c[1] + b * Math.sin(deg * Math.PI / 180)).toFixed(2)];
  const L = { module: 6, entities: { DOCTOR: { ref: true, see: M6, at: D }, USER: { ref: true, see: M6, at: U }, ENCOUNTER: { ref: true, at: [8.5, -1.6] } }, rels: {
    CONDUCTS: { at: [6.6, -5.0] }, OPENS: { at: [10.4, -5.0] } } };
  const left = [['ATTENDS', 'APPOINTMENT'], ['WRITES', 'CONSULTATION'], ['PRESCRIBES', 'PRESCRIPTION'], ['REQUESTS', 'SURGERY_REQUEST'], ['ORDERS', 'LAB_ORDER'], ['ADMITS', 'ADMISSION'], ['ASSIGNED', 'EMERGENCY_CASE']];
  left.forEach(([r, e], i) => { const deg = 128 + i * 17.3; L.rels[r] = { at: ray(D, deg, 2.5, 3.9) }; L.entities[e] = { ref: true, at: ray(D, deg, 4.75, 7.4) }; });
  const right = [['RECORDS', 'VITAL_SIGN'], ['GIVEN_BY', 'MED_ADMINISTRATION'], ['RECEIVES', 'MEDICINE_BATCH'], ['PERFORMS', 'STOCK_MOVEMENT'], ['ANALYSES', 'LAB_RESULT'], ['UPLOADS', 'LAB_ATTACHMENT']];
  right.forEach(([r, e], i) => { const deg = 50 - i * 20; L.rels[r] = { at: ray(U, deg, 2.5, 3.9) }; L.entities[e] = { ref: true, at: ray(U, deg, 4.6, 7.2) }; });
  return L;
})();

module.exports = { diagrams };
