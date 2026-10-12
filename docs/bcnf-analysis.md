# BCNF analysis of hospital_db

Phase 1 of the normalisation work: analysis only. Nothing in the code, schema or data has been changed. Phase 2 starts only for the items you approve (section 6).

**Sources**
- **Live schema:** `hospital_db`, read on 2026-10-13 through information_schema and `SHOW CREATE` in a read-only transaction. It is at migration 014 and has 33 tables, 9 views, 7 triggers, 5 procedures and no events.
- **Code:** every `INSERT`/`UPDATE` in `server/` (controllers, services, routes, utils, scripts), plus `database/seed.sql` and the migrations.
- **Live data:** read-only queries were used as supporting evidence. A dependency is listed only if the schema or the code makes it true. A pattern that merely happens to hold in today's rows is not listed.

**Conventions**
- `X → Y` means every two rows with the same non-NULL `X` have the same `Y`. This is the SQL `UNIQUE` reading of NULL, the usual one for nullable foreign keys.
- "Candidate key" includes keys enforced only by a `UNIQUE` index.
- Surrogate `id` primary keys are candidate keys like any other.
- "Context FK" means a nullable foreign key to the visit or stay a record belongs to: `encounter_id`, `admission_id`, `appointment_id`, `consultation_id` or `batch_id`.

---

## 1. Summary

| # | Table | Candidate keys | 1NF | 2NF | 3NF | BCNF | Kind | Recommendation |
|---|---|---|---|---|---|---|---|---|
| 1 | admissions | {admission_id} | ✓ | ✓ | ✓ | ✓ | c | — |
| 2 | ambulances | {ambulance_id}, {vehicle_number} | ✓ | ✓ | ✓ | ✓ | c | — |
| 3 | **appointments** | {appointment_id}, {doctor_id, appointment_date, appointment_time} | ✓ | ✗ | ✗ | ✗ | **a** | **Convert** (A2, needs your decision on 4 seed rows) |
| 4 | audit_logs | {audit_id} | ✓ | ✓ | ✓ | ✓ | c | — |
| 5 | bed_assignment_log | {log_id}, {admission_id} *(not declared)* | ✓ | ✓ | ✓ | ✓ | b | — |
| 6 | **beds** | {bed_id}, {ward_id, bed_number} | ✓ | ✗ | ✗ | ✗ | **a** | **Convert** (A1) |
| 7 | **bill_items** | {item_id} | ✓ | ✓ | ✗ | ✗ | **a** | Optional (A5) |
| 8 | **bills** | {bill_id} | ✓ | ✓ | ✗ | ✗ | **a** | Enforce, don't decompose (A4) |
| 9 | **consultations** | {consultation_id} | ✓ | ✓ | ✗ | ✗ | **a** | Enforce, don't decompose (A4) |
| 10 | departments | {department_id}, {name} | ✓ | ✓ | ✓ | ✓ | c | — |
| 11 | doctor_daily_analytics | {analytics_id}, {doctor_id, analytics_date} | ✓ | ✓ | ✓ | ✓ | b | — |
| 12 | doctor_schedules | {schedule_id}, {doctor_id, day_of_week, start_time} | ✓ | ✓ | ✓ | ✓ | c | — |
| 13 | doctors | {doctor_id} | ✓ | ✓ | ✓ | ✓ | b | — |
| 14 | emergency_cases | {emergency_id} | ✓ | ✓ | ✓ | ✓ | b | — |
| 15 | **encounters** | {encounter_id}, {appointment_id}, {backfilled_from} | ✓ | ✓ | ✗ | ✗ | **a** | Enforce, don't decompose (A4) |
| 16 | **lab_orders** | {order_id} | ✓ | ✓ | ✗ | ✗ | **a** | Enforce, don't decompose (A4) |
| 17 | lab_result_attachments | {attachment_id}, {stored_filename} | ✓ | ✓ | ✓ | ✓ | c | — |
| 18 | lab_results | {result_id}, {order_id} | ✓ | ✓ | ✓ | ✓ | b | — |
| 19 | lab_tests | {test_id} | ✓ | ✓ | ✓ | ✓ | b | — |
| 20 | **medication_administrations** | {administration_id}, {prescription_item_id, scheduled_at_utc}† | ✓ | ✗† | ✗ | ✗ | **a** | **Convert** (A3) |
| 21 | medicine_batches | {batch_id}, {medicine_id, batch_number} | ✓ | ✓ | ✓ | ✓ | c | — |
| 22 | medicines | {medicine_id} | ✓ | ✓ | ✓ | ✓ | b | — |
| 23 | nurse_ward_assignments | {assignment_id} | ✓ | ✓ | ✓ | ✓ | c | — |
| 24 | patients | {patient_id}, {abha_number} | ✓ | ✓ | ✓ | ✓ | c | — |
| 25 | **pharmacy_stock_movements** | {movement_id} | ✓ | ✓ | ✗ | ✗ | **a** | Enforce, don't decompose (A4) |
| 26 | prescription_item_batches | {id}, {item_id, batch_id} | ✓ | ✓ | ✓ | ✓ | c | — |
| 27 | **prescription_items** | {item_id} | ✓ | ✓ | ✗ | ✗ | **a** (formal) | **Do not convert** (A6) |
| 28 | **prescriptions** | {prescription_id} | ✓ | ✓ | ✗ | ✗ | **a** | Enforce, don't decompose (A4) |
| 29 | schema_migrations | {version} | ✓ | ✓ | ✓ | ✓ | c | — |
| 30 | **surgery_requests** | {request_id} | ✓ | ✓ | ✗ | ✗ | **a** | Enforce, don't decompose (A4) |
| 31 | users | {user_id}, {username}, {email} | ✓ | ✓ | ✓ | ✓ | c | — |
| 32 | **vital_signs** | {vital_id} | ✓ | ✓ | ✗ | ✗ | **a** | Enforce, don't decompose (A4) |
| 33 | wards | {ward_id} | ✓ | ✓ | ✓ | ✓ | c | — |

*Kind:* **a** = a BCNF violation inside the table; **b** = in BCNF, but holds a copy of, or values derived from, data elsewhere (section 3); **c** = in BCNF with no notable redundancy (section 4).

† `(prescription_item_id, scheduled_at_utc)` is unique only for scheduled doses. As-needed doses have `scheduled_at_utc` NULL. The 2NF verdict applies to the scheduled rows; the 3NF and BCNF verdicts apply to every row.

**1NF.** Every table passes. Each has a primary key and typed single-valued columns. There are no repeating column groups. Lists such as the tests on a lab order are stored as rows. Three columns hold structured text but are always read or written whole, so the database treats them as single values:
- `audit_logs.details` (JSON, returned whole by `auditLogController`);
- `emergency_cases.notes` (timestamped lines are appended with `CONCAT`);
- `prescription_items.frequency` / `duration` (free text kept beside the structured `frequency_code` / `duration_days`).

**Counts.**
- **Kind a:** 13 tables. Recommendations:
  - convert 3: `beds` (A1), `appointments` (A2), `medication_administrations` (A3);
  - enforce instead of decomposing 8: `bills`, `consultations`, `encounters`, `lab_orders`, `pharmacy_stock_movements`, `prescriptions`, `surgery_requests`, `vital_signs` (A4);
  - optional 1: `bill_items` (A5);
  - do not convert 1: `prescription_items` (A6).
- **Kind b:** 7 tables: `bed_assignment_log`, `doctor_daily_analytics`, `doctors`, `emergency_cases`, `lab_results`, `lab_tests`, `medicines`.
- **Kind c:** 13 tables.
- **Total:** 33 tables.

---

## 2. (a) BCNF violations inside a table

### A1. `beds`: `ward_id → floor`. Recommendation: **convert**

**Dependency.** A ward has exactly one floor (`wards.floor INT NOT NULL`), and a bed belongs to exactly one ward (`beds.ward_id NOT NULL`, FK). So a bed's floor is its ward's floor. No code writes `beds` rows: they come only from `seed.sql`, migrations 004/005 and a UI test fixture, and every one copies the ward's floor.

**Evidence.** In the live data, `beds.floor = wards.floor` for 35 of 35 beds, and no ward has two different bed floors.

**Normal form.**
- 2NF ✗: `floor` is a non-key attribute that depends on `ward_id`, which is only part of the candidate key {ward_id, bed_number}.
- 3NF ✗: `floor` depends on the key only through `ward_id` (bed_id → ward_id → floor).
- BCNF ✗.

**Anomaly.** Moving a ward to another floor means updating every bed. One missed bed gives the same ward two floors.

**Decomposition**
- `beds(bed_id PK, ward_id FK, bed_number, bed_type, status, has_ventilator)`, with UNIQUE (ward_id, bed_number) unchanged.
- `wards(ward_id PK, …, floor)` already exists. **No new table is needed.**

**Properties**
- *Lossless:* the shared attribute `ward_id` is the key of `wards`. `beds ⋈ wards` gives back every original row, because the floors match 35/35.
- *Dependency-preserving:* `ward_id → floor` is enforced in `wards`, and the keys of `beds` stay in `beds`.

**Affected**

| Area | What changes |
|---|---|
| Views | `available_beds_view` selects `b.floor` and must be recreated to use `w.floor` before the column is dropped. |
| API | `bedController`: `GET /beds`, `/beds/available`, `/beds/:id`, `/beds/ward/:wardId` all return `floor` through `SELECT *` / `b.*`. Each gets `JOIN wards` with `w.floor AS floor`, so responses keep the same shape. |
| Services | `emergencyAllocationService` locks and returns `bed.floor` (`SELECT b.* FROM beds b … FOR UPDATE`). It selects `w.floor` instead, and the lock stays on `beds`. |
| Screens | None. The client never reads `bed.floor`. |
| Triggers, procedures | None. |
| Seed and tests | `database/seed.sql` (6 bed inserts) and `tests/ui/who-is-who.ui.test.js` (bed fixture) stop writing `floor`. |

**Migration**
1. *Additive migration:* check that `beds.floor = wards.floor` for every bed; it raises an error and stops if not. Recreate `available_beds_view` from `wards`.
2. *Code switch:* move every read to `wards.floor`.
3. *Later drop migration, after all tests pass:* `ALTER TABLE beds DROP COLUMN floor`.

---

### A2. `appointments`: `doctor_id → department_id`. Recommendation: **convert, after your decision on 4 rows**

**Dependency**
- `appointmentController.create` reads `department_id FROM doctors WHERE doctor_id = ?` and stores it. The client cannot supply it.
- No code ever updates `doctors.department_id`: `doctorController.update` changes only name, specialization and max_workload.
- So every appointment the app writes satisfies `appointments.department_id = doctors.department_id`, and therefore `doctor_id → department_id` holds inside `appointments`.

**Normal form**
- 2NF ✗: `department_id` depends on `doctor_id`, part of the candidate key {doctor_id, appointment_date, appointment_time}.
- 3NF ✗ and BCNF ✗.

**Evidence, and a problem.** Inside `appointments` the dependency holds (no doctor has two departments). But **4 of the 9 live rows disagree with `doctors`**. All 4 come from `database/seed.sql`:

| appointment | doctor_id (name, dept) | stored department | reason | state |
|---|---|---|---|---|
| 2 | 5 (Vikram Sharma, Orthopedics = 4) | 5 General Medicine | Fever and body ache | BOOKED, no encounter |
| 5 | 6 (Lakshmi Reddy, Pediatrics = 6) | 4 Orthopedics | Knee pain evaluation | COMPLETED, encounter 2, 1 consultation |
| 6 | 5 (Vikram Sharma, Orthopedics = 4) | 5 General Medicine | Annual physical | NO_SHOW, no encounter |
| 9 | 7 (Arjun Singh, Critical Care = 7) | 6 Pediatrics | Vaccination | BOOKED, no encounter |

The seed's appointment rows assume a different doctor numbering. The departments and reasons agree with each other; the `doctor_id` is the value that's off by one. The same rows exist in the test database, and in every other database built from `seed.sql`, including the Azure demo after a reset.

**Decomposition**
- `appointments(appointment_id PK, patient_id, doctor_id FK, appointment_date, appointment_time, status, reason, notes, …)`, with no `department_id`.
- The department comes from `doctors(doctor_id PK, department_id)`, which already exists. **No new table is needed.**

**Properties**
- *Lossless:* yes for every row where the two departments agree. The 4 seed rows above **cannot be rebuilt by the join** unless they are changed first.
- *Dependency-preserving:* `doctor_id → department_id` lives in `doctors`.

**Decision needed: what to do with the 4 rows.**
1. *(Recommended)* Before the switch, set their `department_id` to the doctor's department. Correct `seed.sql` the same way, so fresh builds agree. Keep the 4 old values in the migration's verification output so nothing is silently lost. This changes only how these 4 test rows are labelled; no doctor, encounter or consultation changes.
2. Change the `doctor_id` of those 4 rows to the doctor the reason suggests instead. This is more invasive: appointment 5 already has encounter 2 (doctor 6) and a consultation, and the doctor's care set would change.
3. Leave `appointments` as it is, and treat the department as a snapshot taken at booking time.

**Semantic note.** After conversion, an appointment's department is always its doctor's *current* department. No code changes a doctor's department today, so nothing behaves differently now. If you later add "move a doctor to another department", past appointments would move with the doctor. If you want history kept for that case, choose option 3.

**Affected**

| Area | What changes |
|---|---|
| API | `appointmentController.create` stops writing the column; the 400 "Doctor not found" check stays. Three reads return `department_id` today: `GET /appointments` (`SELECT a.*`, which already joins `doctors`), `GET /appointments/:id` and the doctor's appointment list (both plain `SELECT * FROM appointments`). Each selects `d.department_id`, adding `JOIN doctors` where it's missing, so responses keep the same shape. |
| Views, triggers, procedures | None. |
| Screens | None. The client never reads an appointment's `department_id`. |
| Seed and tests | `seed.sql` appointment insert, and any test that inserts appointments directly. |
| Drop migration | Drops FK `appointments_ibfk_3`, index `department_id`, and the column. |

**Migration**
1. *Additive migration:* apply option 1 or 2 to the 4 rows, then check that every appointment's department matches its doctor's (stop on mismatch).
2. *Code switch.*
3. *Later drop migration.*

---

### A3. `medication_administrations`: `prescription_item_id → patient_id`. Recommendation: **convert**

**Dependency.** Both insert paths copy `patient_id` from the prescription the dose belongs to:
- `marService.scheduleDispensedItems` is called with the dispensed prescription's patient;
- `marController.givenAsNeeded` uses `p.patient_id` from `prescription_items JOIN prescriptions`.

A prescription item belongs to one prescription, which has one patient. `admission_id → patient_id` also holds: the admission is looked up `WHERE patient_id = ?`.

**Evidence.** 15 of 15 rows match their prescription's patient.

**Normal form**
- 2NF ✗ for scheduled doses: `patient_id` depends on part of the key {prescription_item_id, scheduled_at_utc}.
- 3NF ✗ and BCNF ✗ for all rows.

**Why converting is sound here.** `prescription_item_id` is `NOT NULL`, so every dose can always reach its patient through `prescription_items → prescriptions`. Nothing is lost for any row, which is not true of the A4 tables. It also removes a patient-safety risk: today nothing stops a dose row from carrying a different patient than its order.

**Decomposition**
- `medication_administrations` without `patient_id`.
- The patient comes from `prescription_items(item_id PK, prescription_id)` and `prescriptions(prescription_id PK, patient_id)`. **No new table is needed.**

**Properties**
- *Lossless:* yes, 15/15 rows rebuild through the join.
- *Dependency-preserving:* `prescription_item_id → prescription_id → patient_id` is enforced by the existing keys. `admission_id → patient_id` lives in `admissions`.

**Affected**

| Area | What changes |
|---|---|
| Services, API | `marService.scheduleDispensedItems` and `marController.givenAsNeeded` stop writing `patient_id`. `marController.lockDose` reads `p.patient_id`; the join already exists. `marService.loadMar` filters `WHERE ma.patient_id = ?`, which becomes `p.patient_id` with the `pi`/`p` join. That path uses `idx_prescriptions_patient_status` and `uq_mar_item_slot` instead of `idx_mar_patient_time`. |
| API shape | Unchanged. `GET /mar/patients/:id` never returned `ma.patient_id`. |
| Screens | Nurse MAR grid: no change. |
| Seed and tests | `server/tests/mar.test.js` and `demo-reset.test.js`, where they assert on the column. Migration `008_seed_mar_demo.js` runs before the drop and writes doses through the API, so it is unaffected. |
| Drop migration | Drops FK `fk_mar_patient`, index `idx_mar_patient_time` and the column. |

**Migration**
1. *Additive migration:* check that the dose's patient equals the prescription's patient for every row (stop on mismatch).
2. *Code switch.*
3. *Later drop migration.*

---

### A4. Context-FK dependencies in 8 tables. Recommendation: **enforce with composite foreign keys; don't decompose**

In these tables a record carries `patient_id` (and often `doctor_id`, `medicine_id`), and also a nullable link to its visit, stay, order or batch. That parent row already holds the same patient or medicine.

| Table | Dependencies (left side is not a key) | Enforced by today | Live rows matching / total |
|---|---|---|---|
| consultations | `encounter_id → patient_id, doctor_id`; `appointment_id → patient_id, doctor_id, encounter_id`; `admission_id → patient_id` | `resolveEncounterForRecord` checks encounter patient and doctor. **The appointment path doesn't check** that the body's `patient_id` is the appointment's patient. `admission_id` is legacy: current code never writes it. | 3/3 |
| lab_orders | `encounter_id → patient_id, doctor_id`; `admission_id → patient_id`; `consultation_id → patient_id` (legacy rows only) | `resolveOrderContext` | 6/6 |
| prescriptions | `encounter_id → patient_id, doctor_id`; `admission_id → patient_id`; `consultation_id → patient_id` | `resolveOrderContext`. **When `consultation_id` is sent without `encounter_id`**, the encounter is taken from the consultation without checking that it belongs to the same patient and doctor. | 2/2 |
| surgery_requests | `encounter_id → patient_id, doctor_id` | `resolveEncounterForRecord` | 0 rows |
| vital_signs | `encounter_id → patient_id`; `admission_id → patient_id` | `vitalsController.resolveContext` ("does not belong to this patient") | 2/2 |
| encounters | `admission_id → patient_id` (an inpatient stay may have several encounters, so `admission_id` is not a key) | `emergencyAllocationService` links visits of the same patient | 4/4 |
| pharmacy_stock_movements | `batch_id → medicine_id` | batches are locked `WHERE medicine_id = ?` | 4/4 |
| bills | `admission_id → patient_id` | `sp_generate_bill` derives the patient. **`POST /bills` takes both values from the request body with no check.** | 3/3 |

Each table's only key is its single-column id, so 2NF holds. Each is ✗ for 3NF and BCNF: transitive, for example consultation_id → encounter_id → patient_id.

Two pairs look like dependencies but are **not**, so they are not listed. In both, the value is copied when the row is written and later becomes different:
- `lab_orders.encounter_id → admission_id`: 5 of 6 orders differ from their encounter's current admission, because the visit was linked to an admission after the order was placed.
- `prescriptions.encounter_id → admission_id`: same mechanism.

**The textbook decomposition**
- Example: `consultations(consultation_id, encounter_id, …)` plus `encounters(encounter_id, patient_id, doctor_id)`, removing `patient_id` and `doctor_id` from the child.
- It's lossless only for rows whose link is not NULL. Rows that currently have no link:
  - lab_orders: 3 of 9;
  - prescriptions: 2 of 4;
  - pharmacy_stock_movements: 2 of 6;
  - bills: 1 of 4.

**Why decomposition is not sound here**
1. Rows without a link would lose their patient, so the decomposition is lossy. The only workaround is "`patient_id` is filled only when `encounter_id` is NULL", which is harder to query and validate than the current design.
2. Doctor access control is built on these columns. The care-set union in `utils/patientAccess.js`, `patientFilter`, the patient-history routes and the doctor dashboard all filter on `patient_id` and `doctor_id` in these tables, in dozens of queries. Moving them out would rewrite the authorization layer for no gain in correctness.
3. The legacy rows with no visit can't be given one without making up history.

**Proposed instead (keeps the tables as they are, removes the risk of inconsistent rows)**

Add a UNIQUE key on the parent covering the id and the copied columns, then add a composite foreign key from each child. InnoDB checks a composite FK only when none of its columns is NULL, so rows with no link are unaffected.

| Parent: new UNIQUE key | Child: new composite FK |
|---|---|
| `encounters (encounter_id, patient_id, doctor_id)` | consultations, lab_orders, prescriptions, surgery_requests |
| `encounters (encounter_id, patient_id)` | vital_signs |
| `admissions (admission_id, patient_id)` | lab_orders, prescriptions, vital_signs, encounters, bills, consultations |
| `appointments (appointment_id, patient_id, doctor_id)` | consultations |
| `consultations (consultation_id, patient_id)` | lab_orders, prescriptions |
| `medicine_batches (batch_id, medicine_id)` | pharmacy_stock_movements |

**Details**
- **Existing FKs:** the single-column FKs stay, because their `ON DELETE` rules (CASCADE / SET NULL) differ. The new composite FKs are `ON DELETE RESTRICT`. A composite `SET NULL` can't work, because it would try to null the `NOT NULL` `patient_id`.
- **Existing data:** all live rows already comply (table above), so no data changes.
- **Code:** the three unchecked paths (consultation via appointment, prescription via consultation, `POST /bills`) get an explicit check that returns a 400 with the existing error shape. The FK then acts only as a backstop, and FK error 1452 is mapped to the same 400 so it never surfaces as a 500. Valid requests and responses are unchanged.

**Result.** The redundancy stays, so these tables are still formally outside 3NF and BCNF. But the database itself now makes the copies agree, so the update anomaly BCNF guards against can no longer occur. If you would rather have strict BCNF, the only sound route is to make every record belong to a visit (`encounter_id NOT NULL`). That is a product decision, and it would first need a visit created for each of the legacy rows.

**Affected**

| Area | What changes |
|---|---|
| Migrations | One additive migration per parent key. |
| Code | `consultationController.create`, `prescriptionController.create`, `billingController.create` (explicit checks), plus FK-error mapping in those three controllers. |
| Not affected | Views, triggers, procedures and screens. |
| Tests | New tests for the three rejected mismatches. |

---

### A5. `bill_items`: `(quantity, unit_price) → total_price`. Recommendation: **optional**

**Dependency.** Every writer sets `total_price = quantity × unit_price`:
- `billingController.addItem` writes `1, amount, amount`;
- `sp_generate_bill` writes `1, 500.00, 500.00`;
- `seed.sql` rows follow the same rule.

**Evidence.** 19 of 19 rows satisfy it.

**Normal form.** 3NF ✗: `total_price` depends on the key only through two non-key attributes. BCNF ✗.

**Decomposition.** The textbook split is a lookup relation `(quantity, unit_price, total_price)`. It's lossless and dependency-preserving, but it makes no sense for a multiplication.

**Sound fix.** Turn the column into `total_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) VIRTUAL`.
- The value is no longer stored, so there is no redundancy.
- `SELECT *` and the API keep the `total_price` field.
- The `CHECK (total_price >= 0)` remains valid.

**Affected**
- `billingController.addItem`, `sp_generate_bill`, `seed.sql`: stop supplying `total_price`, because inserting into a generated column is an error.
- `server/tests/billing.test.js` reads the value and keeps passing.
- `bills.total_amount` is unaffected (section 3).

**Why optional.** The only writer always sends quantity 1, so the two values cannot drift today. The value of this change is in guarding future code.

---

### A6. `prescription_items`: `dispensed_at → dispensed`. Recommendation: **do not convert**

**Dependency.** `dispenseService` sets `dispensed = TRUE, dispensed_at = NOW()` together, and nothing else writes `dispensed_at`. So a non-NULL `dispensed_at` always comes with `dispensed = 1`. Formally that is a dependency whose left side is not a key (items dispensed in the same statement share `dispensed_at`).

**Why not convert.** The natural fix would replace the flag with `dispensed_at IS NOT NULL`, but that loses information:
- Items 7, 8 and 9 (prescription 3, from `seed.sql`) have `dispensed = 1` and no `dispensed_at`. They would become undispensed, and could then be dispensed again, taking stock a second time.
- The `after_prescription_dispense` trigger and the `AND dispensed = FALSE` guard against dispensing twice both key on the flag.
- Backfilling a time for those 3 rows would invent history.

So the flag carries information the timestamp doesn't. Leave both columns as they are.

---

## 3. (b) Cross-table copies and derived values that are not BCNF violations

BCNF is about dependencies *between columns of one row*. None of the items below breaks it, for one of three reasons:
- the value is an aggregate over rows of another table, which no column of the row determines;
- the copied value's source is a candidate key of this table;
- the value is a snapshot taken at write time, which later legitimately differs from its source.

They are still redundancy, and each is kept in step by code or triggers, as described.

| Data | Derived from | Why it is not a BCNF violation | Why it exists, and how it's kept in step | Live check |
|---|---|---|---|---|
| `bills.total_amount` | initial amount + SUM(`bill_items.total_price`) | aggregate over another table | Lets list screens and `pending_bills_view` read it without a SUM, and the `paid_amount <= total_amount` CHECK needs it in the row. Updated in the same transaction as `addItem` and in `sp_generate_bill`. | 4/4 agree |
| `bills.status` | `paid_amount` vs `total_amount` | `CANCELLED` is independent of the amounts, so the amounts don't determine status | Set by `pay` (PAID/PARTIAL) | 4/4 agree |
| `medicines.stock_quantity` | SUM(`medicine_batches.quantity`) | aggregate | Older column used by the negative-stock trigger, the CHECK and every pharmacy screen. Changed in the same transaction as the batches (`medicineRoutes`, `dispenseService` plus trigger). `v_current_stock` reports both. | 22/22 agree |
| `medicines.expiry_date` | (old single expiry) | no dependency: it is the default expiry for new receipts | Kept from before batches; it equals the earliest batch expiry today only because no new batch has been received | — |
| `beds.status` = OCCUPIED | an ACTIVE admission on the bed | aggregate (an existence test over `admissions`); MAINTENANCE and RESERVED are set by hand | Triggers `after_admission_insert` / `after_admission_discharge`; the allocation code locks beds by status | 35/35 agree |
| `doctors.current_workload` | COUNT of the doctor's ACTIVE admissions | aggregate | The same triggers; the `current_workload <= max_workload` CHECK depends on it | **2/12 wrong** (see note 1) |
| `doctors.name` | `users.full_name` | other table; `user_id` is not declared unique | Copied when the account is created (`accountService`). `PUT /doctors/:id` changes only `doctors.name`, so the two can drift. | 12/12 agree |
| `appointments.status` | `encounters.status` | other table | Copied by `utils/encounters.js` (APPOINTMENT_MIRROR) in the same transaction, with the appointment row locked | 5/5 agree |
| `encounters.patient_id`, `doctor_id` | the appointment's | `appointment_id` is a candidate key of `encounters` (UNIQUE), so the dependency's left side is a key | Copied at arrival (`arriveAppointment`) | 5/5 agree |
| `bed_assignment_log` (all columns) | `admissions` (bed, patient, dates, status) | `admission_id` is in practice a key (one row per admission; there is no bed-transfer feature), so it is in BCNF | Written only by triggers; **no application code reads it**. If bed transfers are added, `admission_id` stops being a key and `admission_id → patient_id` becomes a 3NF violation. | 19/19 agree |
| `emergency_cases.assigned_doctor_id`, `assigned_bed_id`, `status` | the admission created from the case | other table | Set in the allocation transaction | 4/4 agree |
| `admissions.patient_id` for emergency admissions | `emergency_cases.patient_id` | not a dependency: `PUT /emergency/:id` can set a case back to WAITING, its patient can be relinked, and it can be allocated again | Copied when the emergency is allocated | 4/4 agree |
| `lab_results.unit`, `reference_range`, `reference_low/high` | the test's defaults, or the technician's entry | snapshot: 3 of 6 results differ from the test today, as designed | Records the range the result was judged against | — |
| `lab_results.interpretation` | value and ranges | not determined: the critical limits aren't stored on the result, and a manual entry (`interpretation_source = MANUAL`) can override | Computed when possible, otherwise entered | — |
| `lab_tests.reference_low/high` | `normal_range` text | not a rule: parsed once by migration 009, and no code writes `lab_tests` | Numeric bounds for automatic flagging; the text is kept for display | — |
| `doctor_daily_analytics` (counts) | appointments, emergency_cases, admissions | aggregates; inside the table everything depends on the key {doctor_id, analytics_date} | Cache recomputed on every doctor dashboard load (`doctorController`) | — |
| `prescriptions.status` | its items' `dispensed` flags | aggregate | Set to DISPENSED in the dispense transaction | — |
| `audit_logs.role`, `patient_id`, `entity_*` | the user and the request at that moment | snapshot: `role` is the role the actor acted in (`MIGRATION` for a seed migration, NULL for a failed login), so `user_id → role` does not hold (2 rows differ); `action → entity_type` also fails (3 actions) | Append-only record; triggers block UPDATE and DELETE | — |
| `lab_orders.admission_id`, `prescriptions.admission_id` | the encounter's admission at the time of the order | snapshot (5/6 differ, see A4) | Records where the order was placed | — |
| `medication_administrations.admission_id` | the patient's ACTIVE admission at scheduling time | snapshot | Lets discharge cancel only that stay's doses | — |

**Note 1: drift found in `doctors.current_workload`.**
- **Symptom:** doctors 1 (Dr. John Smith) and 5 (Dr. Vikram Sharma) are each 1 higher than their number of active admissions.
- **Cause:** `seed.sql` inserts two admissions that are already discharged (admissions 10 and 11). `after_admission_insert` adds 1 to the workload for every insert, whatever the status, and the discharge trigger never runs for a row inserted as DISCHARGED.
- **Effect:** each of these doctors reaches `max_workload` one admission early.
- **Not fixed:** this is a data and trigger issue rather than a normal-form issue, and Phase 1 changes nothing. Section 6 lists it as a separate item you can approve.

---

## 4. (c) Tables already in BCNF

In each of these tables, every column depends only on a candidate key, and the code does not enforce any other dependency.

- **users:** keys {user_id}, {username}, {email}. Role, name and phone depend on the user.
- **departments:** keys {department_id}, {name}. Floor, phone and description are the department's own attributes.
- **wards:** key {ward_id}. `department_id → floor` is **not** a rule: `POST /wards` takes the ward's floor separately, and a department may span floors. It holds in today's 6 rows only by chance. `name` is not unique.
- **ambulances:** keys {ambulance_id}, {vehicle_number}. The driver's name and phone belong to the vehicle record, and no rule links them.
- **doctor_schedules:** keys {schedule_id}, {doctor_id, day_of_week, start_time}. `end_time` and `is_available` depend on the whole slot.
- **patients:** keys {patient_id}, and {abha_number} when present (UNIQUE, NULLs allowed). Age is computed when read, not stored.
- **admissions:** key {admission_id}. `department_id` is **not** determined by the bed or the doctor. Doctors' admissions use the bed's ward department, staff admissions take it from the form, and emergency admissions use the doctor's department. 6 of 19 differ from the bed's ward and 11 of 19 from the doctor's department.
- **emergency_cases:** key {emergency_id}. `required_bed_type → ventilator_required` fails in the data (one bed type with both values), and no code links them.
- **lab_result_attachments:** keys {attachment_id}, {stored_filename}.
- **medicine_batches:** keys {batch_id}, {medicine_id, batch_number}.
- **prescription_item_batches:** keys {id}, {item_id, batch_id}.
- **nurse_ward_assignments:** key {assignment_id}. An assignment's dates and author depend on the assignment.
- **schema_migrations:** key {version}.

- **audit_logs:** key {audit_id}. Its snapshot columns appear in section 3, but no dependency holds between them (`user_id ↛ role`, `action ↛ entity_type`).

The 7 kind-b tables (`bed_assignment_log`, `doctor_daily_analytics`, `doctors`, `emergency_cases`, `lab_results`, `lab_tests`, `medicines`) are also in BCNF internally; section 3 describes their copied and derived values.

---

## 5. Other findings (no normal-form change, for your information)

- **Missing UNIQUE constraints.** `doctors.user_id` is meant to be one doctor per user (login looks the doctor up by user). Only `accountService` guarantees it; `POST /doctors` could insert a second doctor for the same user. `bed_assignment_log.admission_id` is likewise one row per admission, enforced only by the trigger.
- **Unused database objects.** Seven of the 9 views and all 5 procedures are not called by the app; only `v_current_stock` is. They still have to be updated whenever a column they use moves. For example, `available_beds_view` uses `beds.floor` and `sp_generate_bill` writes `bill_items.total_price`.
- **Unchecked paths.** The three request paths in A4 that don't check the patient are real holes today, whatever you decide about BCNF.

---

## 6. What I need from you before Phase 2

Please approve or reject each item:

| Item | Proposal | What it touches |
|---|---|---|
| **A1** `beds.floor` | Convert: read floor from `wards`, drop the column later | 1 view, the bed API, emergency allocation, seed, 1 UI test fixture |
| **A2** `appointments.department_id` | Convert, after choosing **option 1, 2 or 3** for the 4 seed rows | Appointment API, seed |
| **A3** `medication_administrations.patient_id` | Convert: get the patient through the prescription, drop the column later | MAR service and controller, MAR tests |
| **A4** context FKs (8 tables) | Add composite FKs plus explicit checks on the 3 unchecked paths. The tables stay formally outside BCNF. | 6 parent keys, 3 controllers |
| **A5** `bill_items.total_price` | Optional: make it a generated column | Billing controller, `sp_generate_bill`, seed |
| **A6** `prescription_items.dispensed` | Leave as is (recommended) | — |
| **Workload drift** (section 3, note 1) | Optional, separate from BCNF: correct doctors 1 and 5, and make `after_admission_insert` count only ACTIVE admissions | 1 trigger, 2 rows |

**How Phase 2 works, for each approved item**
1. Back up `hospital_db`, then rehearse on a copy of the live data.
2. Apply an additive migration that checks the data and stops on any mismatch.
3. Switch the code over, keeping API requests and responses unchanged.
4. Run the full server suite, the browser suite, the stress test and the patient-journey test.
5. Run the schema diff.
6. Commit.

After all approved items pass, one later migration drops the old columns. Then `docs/database-report.pdf` and its source are updated with the before and after normal forms and the decomposition steps. I'll ask you before anything is deployed to Azure.
