# Gap Analysis & Implementation Plan

This analysis checks the codebase (`main` @ `70b0729`) against *Professional HIS: Complete Feature Audit and Implementation Roadmap*, Sections G, I, K and L. It was approved on 2026-10-09. Each item ships as its own commit on `feature/his-roadmap`, and each waits for an explicit go-ahead.

## 1. Gap analysis (Sections G, I, K, L)
| # | Feature (report ref) | Status | Evidence | Action |
|---|---|---|---|---|
| 1 | Deadlock-free dispensing (G, I-1, K-1, L-1) | **Partial** | `prescriptionController.js:133-137` locks medicines via JOIN in item order (unsorted, not deduped). Role check `:123` only blocks DOCTOR/LAB (Nurse/Reception/Admin can dispense). CHECK `stock_quantity>=0` and the trigger fail-safe exist ✔ | Aggregate qty per medicine_id, sort ASC, lock `medicines` rows sequentially FOR UPDATE, then return 400 `Insufficient Stock for Medicine ID X` (same shape). PHARMACY only. Loading state and error modal in PharmacyDashboard |
| 2 | Secure lab report retrieval (G, I-2, K-2, L-2) | **Partial** | Files in `server/uploads/lab-reports` are **not** publicly served (no `express.static` in server.js) ✔; DB stores `stored_filename` only ✔. But `downloadAttachment` (`labController.js:15`) and `getResult` (`:13`) have **no role or ownership check**, `listOrders` (`:10`) returns all orders to everyone, and there is no path containment check | Keep storage dir (already non-public). Add `GET /api/lab/reports/:result_id/download` (optional `?attachment_id`) and the same checks on the existing `/lab/attachments/:id`: LAB all, DOCTOR care-set, NURSE assigned, others 403. Add `path.resolve` containment check, then `fs.createReadStream`. Doctor "View Report" button in PatientDetail |
| 3 | Audit logs + middleware (G, I-3, K-4) | **Missing** (stock ledger only) | No `audit_logs` table. `pharmacy_stock_movements` covers stock only | New `audit_logs`, made immutable by BEFORE UPDATE/DELETE triggers that SIGNAL. Non-blocking `res.on('finish')` middleware on PHI routers, with sanitized details JSON. LOGIN_SUCCESS/FAILED and 401/403 logged. In-transaction domain events for dispense/MAR |
| 4 | Encounter lifecycle (G, I-4, K-3) | **Missing** | Consultations are tied to `appointment_id` (`schema.sql:191`). Appointment status updates accept any value from any role (`appointmentController.js:61-73`). DoctorDashboard drives CHECKED_IN→IN_PROGRESS→COMPLETED (`DoctorDashboard.jsx:130-131`) | New `encounters` table + state machine (see §3). Nullable `encounter_id` on consultations, lab_orders, prescriptions, surgery_requests, with backfill |
| 4b | Section E enforcement on existing routes | **Missing** | `authorize` is unused outside register; non-doctor roles can read all clinical history | Apply the §4 matrix. Ship nurse and receptionist landing pages, nurse ward assignments, 403 UI handling |
| 5 | Batch & FEFO (G, I-5, K-6) | **Missing** | Single `medicines.stock_quantity` + `expiry_date` (`schema.sql:213-215`) | `medicine_batches`, backfill, FEFO dispense (see §3). **medicines.stock_quantity is kept, not dropped** |
| 6 | MAR (G, I-6, K-5) | **Missing** | NURSE role exists only in the enum (`schema.sql:34`); nurse sees the generic dashboard (`App.jsx:39-40`) | `medication_administrations` + bedside verification modal (see §3) |
| 7 | Structured lab ref ranges (G, I-7, K-7) | **Partial** | Live `lab_results` has `unit`, `reference_range` (string), `interpretation ENUM(NORMAL,LOW,HIGH,CRITICAL)`, but it is chosen manually (`LabDashboard.jsx:191-196`). `lab_tests.normal_range` is a string | Add numeric reference_low/high (+critical bounds) to lab_tests (backfilled by parsing `a-b`) and lab_results, plus `numeric_value`. Server auto-computes the existing `interpretation` column when it can; manual entry still accepted. Red highlighting |
| 8 | ABHA capture (G, I-8, K-8) | **Missing** | `patients` has no ABHA (`schema.sql:70-81`); no registration UI | `patients.abha_number CHAR(14) NULL UNIQUE` (digits; displayed XX-XXXX-XXXX-XXXX), regex validation front and back, 409 on duplicate. Receptionist registration form with duplicate search (name/phone/ABHA) |
| 9 | Admin audit viewer (G, I-9, K-9) | **Missing** | ReportsDashboard reuses dashboard stats | `GET /api/audit-logs` (ADMIN, date/user/action/patient/status filters, paginated) + read-only `/audit` page + "denied access (24h)" stat |
| 10 | Vitals flowsheet (G, I-10, K-10) | **Missing** | none | `vital_signs` table with CHECK ranges, linked to encounter/admission. Nurse entry form + inline-SVG trend chart (no chart library) |
| 11 | Socket.IO arrival event (I-11) | **Missing** | No per-doctor rooms; socket JWT is sent by the client but never verified | Verify JWT in `io.use`. `doctor:<id>` room. Emit `encounter:updated` on arrive/triage/start/finish; DoctorDashboard refreshes its queue |
| L-tests | Deadlock, atomic rollback, 401, 403 role, 403 lateral, path traversal | **Missing** | no runner | Covered in §2 / per-feature tests |

**Already correct, left untouched:** JWT on all API routers; emergency allocation locking (`emergencyAllocationService.js`); doctor care-set isolation (definition kept, encounters added to it); multi-test ordering in one transaction (`labController.js:9`); multi-item prescriptions; negative-stock CHECK + trigger; stock movement ledger; upload type/size filter (`labController.js:4`); lab ORDERED→PROCESSING→COMPLETED with FOR UPDATE.

**Pre-existing broken flows (code fixed to match the schema; no schema changes):**
- 0a **Appointment booking**: the form sends camelCase (`AppointmentForm.jsx:10-16,26`); the controller inserts `"SCHEDULED"` (not in the enum) and omits NOT NULL `department_id` (`appointmentController.js:12`). Fix: the form sends `patient_id/doctor_id/appointment_date/appointment_time`; the backend inserts `BOOKED` and derives `department_id` from `doctors`; unknown doctor returns 400.
- 0b **Ambulance create/update** write `contact_number` (`ambulanceController.js:11,18`); the column is `driver_phone`. Fix: map the column; accept `driver_phone` or `contact_number` in the body.
- 0c **Billing create** uses `generated_at` and `"UNPAID"` (`billingController.js:5`) → `bill_date`, `PENDING`. **addItem** omits NOT NULL `category/unit_price/total_price` (`:31`) → category from body if valid, else `OTHER`; quantity 1; unit/total = `amount`.
- Also broken, but no UI caller, so documented only: `wards.create` (missing NOT NULL capacity), `departments.create` (missing floor), `auth.register` (non-existent `doctor_id` column; missing full_name/email/phone).

**Not in G/I/K/L, so deferred unless you ask:** lab order grouping/requisition (Section C); a lab "Awaiting Verification" status (needs an enum change); admin throughput metrics from the Section C table.

## 2. Test & migration infrastructure (first commit after docs)
- `database/migrations/000_baseline.sql`: read-only `mysqldump --no-data --routines --triggers --events --skip-add-drop-table` of hospital_db (password via `MYSQL_PWD` env, not argv), with AUTO_INCREMENT values stripped.
- `server/scripts/migrate.js`: applies `database/migrations/NNN_*.sql` in order and records them in `schema_migrations`. On a DB that already has tables, 000 is only *marked* applied. New migrations are additive and applied to hospital_db only when a feature ships (I'll say so in each summary).
- `server/scripts/test-db.js`: refuses unless the DB name ends in `_test`. Recreates `hospital_db_test`, loads 000 + migrations + `seed.sql`. It **strips `USE hospital_db;`** (present in seed/views/procedures) and asserts `DATABASE()='hospital_db_test'` before each file.
- `server/scripts/schema-diff.js`: compares information_schema (columns, indexes, FKs, checks, triggers, routines, views, events) of hospital_db and hospital_db_test. **This must report zero differences before any test is written.**
- Runner: Node built-in `node:test` + global `fetch` (no new deps). `server/package.json` gets `"test": "node --test tests/"`. A global setup rebuilds the test DB and spawns `server.js` as a child process with `DB_NAME=hospital_db_test PORT=5099`, so server.js needs no changes. Tests live in `server/tests/*.test.js`.

## 3. Implementation order (one commit each; stop for go-ahead after each)
**Fixes:** 0a booking → 0b ambulance → 0c billing (each with a regression test).

**Phase 1 (P0)**
1. **Dispense deadlock fix** (`prescriptionController.dispense`). Lock order: prescription → medicines sorted ASC → (later) batches. Tests: 20 concurrent pairs dispensing [1,2] vs [2,1] with no ER_LOCK_DEADLOCK (1213) and correct final stock; atomic rollback (item 2 short → item 1 stock unchanged, nothing marked dispensed); non-PHARMACY gets 403.
2. **Secure lab retrieval** as in table row 2, using a new `server/utils/patientAccess.js` (`canAccessPatient(user, patientId)`, reusing the existing care-set SQL; nurse branch added in 4b). Tests: no JWT → 401; receptionist → 403; doctor B on doctor A's patient → 403; a DB row with `stored_filename='../../../etc/passwd'` is rejected; non-numeric id → 400. *Needs your OK in that commit:* add `server/uploads/` to .gitignore and `git rm --cached` the tracked PDF (history not rewritten).
3. **Audit logs**: migration 001 (`audit_logs`: id, user_id, role, action, entity_type, entity_id, patient_id, ip_address, method, path, status_code, created_at, details JSON, + immutability triggers). `server/middleware/audit.js` maps routes to actions (READ_PATIENT_HISTORY, UPDATE_CONSULTATION, DOWNLOAD_LAB_REPORT…) and redacts password/token fields. `writeAudit(conn, …)` is used inside the dispense transaction. Tests: rows written for reads/mutations/denials; UPDATE/DELETE on audit_logs fail; an audit write failure doesn't fail the request.
4. **Encounters**: migration 002.
   - `encounters` (encounter_id, patient_id, doctor_id, appointment_id NULL UNIQUE, admission_id NULL, encounter_type OUTPATIENT/INPATIENT/EMERGENCY, status, arrived_at, triaged_at, start_timestamp, end_timestamp, created_by, timestamps). Status enum uses the codebase's uppercase style, mapped to FHIR codes: `PLANNED, ARRIVED, TRIAGED, IN_PROGRESS, FINISHED, CANCELLED, ENTERED_IN_ERROR`.
   - Nullable `encounter_id` FKs on the four clinical tables. Backfill: one FINISHED encounter per existing appointment-linked/standalone consultation; propagate to lab_orders/prescriptions via consultation_id.
   - Allowed transitions (anything else → 409):

     | From | To | Trigger | Appointment mirror |
     |---|---|---|---|
     | PLANNED / none | ARRIVED | receptionist "Mark Arrived" | CHECKED_IN |
     | ARRIVED | TRIAGED | nurse | CHECKED_IN (unchanged) |
     | ARRIVED or TRIAGED | IN_PROGRESS | doctor (triage not required) | IN_PROGRESS |
     | IN_PROGRESS | FINISHED | doctor "Sign & Close" | COMPLETED |
     | PLANNED / ARRIVED / TRIAGED | CANCELLED | left without being seen | CANCELLED |
     | any non-FINISHED | ENTERED_IN_ERROR | doctor | CANCELLED |

   - Encounter and appointment status are written **in one transaction** with the appointment row locked FOR UPDATE. The existing `PUT /appointments/:id/status` keeps its request/response shape and routes CHECKED_IN/IN_PROGRESS/COMPLETED/CANCELLED through the same transition function.
   - New `/api/encounters` routes: queue, `:id`, arrive, triage, start, finish, cancel, entered-in-error.
   - Consultations: `encounter_id` optional (auto-linked from an in-progress appointment encounter). Edits are rejected (409) once the encounter is FINISHED.
   - DoctorDashboard buttons call start/finish.
   - PatientDetail gets a **persistent context header** (name, age, sex, MRN, allergies). MRN is the formatted patient_id (`MRN-000123`), so no new column. Allergies show "Not recorded" until #8 adds the column.
   - Tests: every valid/invalid transition, plus a mirror-consistency check under concurrent requests.
4b. **Section E enforcement** (I'll re-show the §4 matrix for confirmation right before this commit).
   - Migration 003: `nurse_ward_assignments` (nurse_user_id, ward_id, assignment_date, shift, assigned_by) + a small Admin assignment screen.
   - Same commit ships the Nurse landing (assigned-ward bed cards + arrived/triaged queue) and the Receptionist landing (today's appointments with Mark Arrived/Cancel, patient search, book).
   - `api.js` 403 handling: toast with server message; pages render an "Access denied" state instead of crashing. Sidebar/RoleRoute match the matrix.
   - Per-role tests: each role can do its workflow and is denied everything else.

**Phase 2 (P1)**
5. **Batches/FEFO**: migration 004.
   - New tables: `medicine_batches` (UNIQUE medicine_id+batch_number, CHECK qty>=0), `prescription_item_batches` (traceability), nullable `pharmacy_stock_movements.batch_id`, view `v_current_stock`.
   - Backfill: one `LEGACY-<id>` batch per medicine (qty = stock_quantity, expiry = medicines.expiry_date).
   - `medicines.stock_quantity` stays as an aggregate maintained in the same transaction (the existing trigger keeps decrementing it).
   - Dispense locks non-expired batches `ORDER BY expiry_date, batch_id FOR UPDATE` per sorted medicine and carries the remainder to the next batch; insufficient non-expired stock → 400 rollback.
   - `POST /medicines/:id/stock` keeps its shape. Optional `batch_number`/`expiry_date` on RECEIPT (defaults auto-generated); ADJUSTMENT deducts FEFO or takes an optional `batch_id`.
   - UI: batch rows + expiring-soon alert.
   - Tests: FEFO order, multi-batch carry-over, expired batches skipped, aggregate == SUM(batches) invariant, deadlock test re-run.
6. **MAR**: migration 005.
   - `medication_administrations` (prescription_item_id, patient_id, admission_id, nurse_user_id, scheduled_time, administered_time, status PENDING/ADMINISTERED/REFUSED/MISSED, dose_given, route, clinical_notes).
   - Nullable structured columns on prescription_items: `route`, `frequency_code` (OD/BD/TDS/QID/Q6H/Q8H/STAT/PRN), `duration_days`, captured by the prescribing modal. The free-text fields are kept.
   - Doses are generated at dispense **only for patients with an ACTIVE admission and structured frequency**. Legacy free-text items show as "unscheduled" with ad-hoc recording.
   - Nurse MAR grid (medicines × hours). The verification modal requires typing/confirming the patient MRN and confirming drug, dose, route and time window. The backend locks the dose row FOR UPDATE, checks nurse assignment, dispensed state and PENDING status, then writes the audit entry.
   - Tests: Five-Rights rejections, double-administration race, unassigned nurse → 403.
7. **Lab ranges** (migration 006) as in table row 7, plus a Kanban layout of the existing statuses. Tests: auto-flag LOW/HIGH/CRITICAL; old payload still accepted.
8. **ABHA**: migration 007 (`abha_number`, `allergies TEXT NULL`) + registration form + search by phone/ABHA (additive query params). Tests: format, duplicate 409, role checks.

**Phase 3 (P2)**
9. Audit viewer. 10. Vitals flowsheet (migration 008; nurse triage form offers "mark triaged"). 11. Socket auth + `encounter:updated` per-doctor rooms.

## 4. Proposed per-route read/write matrix (to confirm before 4b)
AD=Admin, DR=Doctor (care set), NU=Nurse (assigned), RC=Reception, LB=Lab, PH=Pharmacy.
- **Auth**: login public; register AD; me all.
- **dashboard/stats**: AD.
- **Doctors / departments / wards (GET)**: all. **POST/PUT**: AD. Doctor status: AD + DR self. `me/analytics`: DR.
- **Patients**:
  - list/search: AD, RC; DR care-set filter (existing); NU assigned.
  - POST/PUT: AD, RC.
  - GET :id (demographics): AD, RC, DR, NU.
  - `/history`: DR; NU (consultations and surgeries arrays returned empty, same shape).
  - `/admissions`, `/appointments`: AD, RC, DR, NU.
  - `/prescriptions`: DR, NU, PH. `/lab-results`: DR, NU, LB.
- **Appointments**: GET: AD, RC, NU; DR own (existing). POST and PUT status: AD, RC. Doctors move status via encounter routes.
- **Encounters**: queue: DR own, NU, RC (no clinical fields). arrive/cancel: AD, RC. triage: NU. start/finish/entered-in-error: DR own.
- **Consultations, surgery**: DR only (writes need an in-progress encounter where applicable).
- **Prescriptions**: GET: DR, PH, NU. POST: DR. dispense: PH. Medicines GET: DR, NU, PH, AD. Stock: PH.
- **Lab**:
  - tests GET: DR, NU, LB, AD.
  - orders POST: DR. Orders GET: LB all; DR, NU filtered.
  - status/results/upload: LB.
  - result + report download: LB, DR, NU.
- **Admissions**: GET: AD, RC, NU (assigned wards); DR own. POST: AD, RC, DR (existing checks). Discharge: DR own, AD.
- **Bills**: AD, RC.
- **New routes**: vitals: DR, NU (write and read). MAR: NU write; DR, NU read. nurse-assignments: AD write, NU read own. audit-logs: AD.
- **Unchanged (your call, per your instruction): emergency, ambulances, beds.** These are currently open to every authenticated role.
- **Assigned definitions:**
  - Doctor: existing care-set union + encounters. This is broader than Section E's "active admission or recent encounter"; kept to avoid regressions.
  - Nurse: an ACTIVE admission in a ward assigned to them today, or an outpatient encounter that is ARRIVED/TRIAGED/IN_PROGRESS today (shared triage area).

## 5. Verification after every commit
1. `cd server && npm test`: full suite on hospital_db_test, including all earlier features' and fixes' tests.
2. Smoke test (API) against the test-DB server: login for all 6 roles, booking, emergency allocation, prescribing, dispensing, lab result entry.
3. Boot the dev server on hospital_db for startup + read-only GETs only, so no mutations land in your DB.
4. `npm run build` in client.
5. Puppeteer (already a root dependency) logs in as each role and checks the landing page renders.

Failures are fixed before the summary. A test I can't fix properly gets reported, never weakened.
