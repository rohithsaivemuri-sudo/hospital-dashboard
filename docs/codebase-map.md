# Codebase Map

This snapshot was taken on branch `main` @ `70b0729` before any HIS-roadmap changes. It describes the code **as it is**, including known defects, which are marked ⚠.

## 1. Architecture

```
client/ (React 18 + Vite 4, port 5173)
  └─ axios /api  ──proxy──▶ server/ (Express 4, port 5000) ──mysql2/promise pool──▶ MySQL (hospital_db)
  └─ socket.io-client ─proxy─▶ Socket.IO on the same http server
```

- **Server entry:** `server/server.js`. It mounts the JSON body parser and CORS, wires Socket.IO, then 17 routers under `/api/*`. Every router except `/api/auth` is wrapped in `verifyToken`. There is **no `express.static`**: uploaded files are not publicly served.
- **DB pool:** `server/config/db.js` (20 connections; settings from `server/.env`: `DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET, PORT, CLIENT_URL`).
- **Auth:** `server/controllers/authController.js` issues a JWT (`{user_id, username, role, doctor_id}`, 1 day). `server/middleware/auth.js` exports `verifyToken` and `authorize(...roles)`. `authorize` is used only on `POST /api/auth/register`.
- **Authorization style:** checks are inline in controllers. Five controllers (patient, consultation, prescription, surgery, lab) each carry a copy of `checkDoctorAuth`. For DOCTOR it tests membership of the doctor's *care set* (`appointments ∪ admissions ∪ consultations ∪ lab_orders ∪ prescriptions` for that doctor_id). For **every other role it returns true**.
- **Concurrency:**
  - `services/emergencyAllocationService.js` uses a transaction with `FOR UPDATE` on the emergency, bed and doctor.
  - `admissionController.create` locks the bed.
  - `prescriptionController.dispense` locks the prescription, then items JOIN medicines.
  - `medicineRoutes` stock movements lock the medicine row.
- **Uploads:** multer disk storage in `server/uploads/lab-reports` (PDF/PNG/JPEG, 10 MB), configured in `labController.js`.
- **Sockets:** `server/sockets/socketHandler.js` has rooms `dashboard`, `emergency`, `beds` and **no handshake auth**. Server emits:
  - `emergency:new`, `emergency:allocated`, `emergency:no-bed`, `emergency:no-doctor`
  - `bed:updated`, `doctor:updated`, `admission:new`, `dashboard:refresh`

  Client listeners: `Dashboard` (`dashboard:refresh`, `emergency:allocated`), `EmergencyQueue` (`emergency:queue_updated` ⚠ never emitted, `emergency:new`), `BedDashboard` (`bed:status_changed/allocated/discharged` ⚠ never emitted).

## 2. Database

Live DB: MySQL 9.7.1, `STRICT_TRANS_TABLES`, `REPEATABLE-READ`, InnoDB.

⚠ **The SQL files in `database/` do not reproduce the live schema.**
- Live `pharmacy_stock_movements.movement_type` includes `DISPENSE`, and the table has a `reference_id` column; neither appears in any file.
- `schema.sql:373-412` contains ALTERs that were never applied (there is no `lab_reports` or `pharmacy_transactions` table).
- `lab_pharmacy_workflow.sql` is not run by `db:init`.

`database/migrations/000_baseline.sql` (a dump of the live schema) is now the source of truth.

### Tables and relations
| Table | Key columns | Relations (FK → target, on delete) |
|---|---|---|
| users | user_id, username UQ, role ENUM(ADMIN, DOCTOR, RECEPTIONIST, NURSE, LABORATORY, PHARMACY), full_name, email UQ, phone, is_active | — |
| departments | department_id, name UQ, floor | — |
| doctors | doctor_id, user_id, department_id, specialization, status, shift, current_workload ≤ max_workload | user_id→users RESTRICT; department_id→departments RESTRICT |
| patients | patient_id, name, date_of_birth, gender, blood_group, phone, address, emergency_contact | — |
| wards | ward_id, department_id, floor, capacity, ward_type | department_id→departments |
| beds | bed_id, ward_id, bed_number (UQ per ward), bed_type, status, has_ventilator | ward_id→wards |
| ambulances | ambulance_id, vehicle_number UQ, driver_name, driver_phone, status | — |
| emergency_cases | emergency_id, patient_id, ambulance_id, severity, required_bed_type, status, assigned_doctor_id, assigned_bed_id | →patients RESTRICT, →ambulances / →doctors / →beds SET NULL |
| doctor_schedules | doctor_id, day_of_week, start/end_time | →doctors CASCADE |
| appointments | appointment_id, patient_id, doctor_id, department_id (NOT NULL), date, time, status ENUM(BOOKED, CHECKED_IN, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW); UQ(doctor, date, time) | →patients, →doctors, →departments RESTRICT |
| admissions | admission_id, patient_id, doctor_id, bed_id, department_id, emergency_id, admission/discharge_date, status ENUM(ACTIVE, DISCHARGED, TRANSFERRED), diagnosis | →patients, →doctors, →beds, →departments RESTRICT; →emergency_cases SET NULL |
| consultations | consultation_id, appointment_id, patient_id, doctor_id, admission_id, symptoms, diagnosis, assessment, plan, notes, consultation_time | →appointments SET NULL; →patients, →doctors RESTRICT; →admissions CASCADE |
| medicines | medicine_id, name, category, stock_quantity (CHECK ≥ 0), reorder_level, unit_price, expiry_date | — |
| prescriptions | prescription_id, consultation_id, patient_id, doctor_id, status ENUM(CREATED, DISPENSED, PARTIALLY_DISPENSED, CANCELLED) | →consultations CASCADE; →patients, →doctors RESTRICT |
| prescription_items | item_id, prescription_id, medicine_id, dosage, frequency, duration (free text), quantity > 0, dispensed, dispensed_at | →prescriptions CASCADE; →medicines RESTRICT |
| pharmacy_stock_movements | movement_id, medicine_id, movement_type ENUM(RECEIPT, ADJUSTMENT, DISPENSE), quantity (signed), reason, notes, performed_by, reference_id | →medicines, →users RESTRICT |
| lab_tests | test_id, name, category, department_id, normal_range (text), unit, cost | →departments SET NULL |
| lab_orders | order_id, consultation_id, patient_id, doctor_id, test_id, status ENUM(ORDERED, SAMPLE_COLLECTED, PROCESSING, COMPLETED, CANCELLED), priority | →consultations SET NULL; others RESTRICT |
| lab_results | result_id, order_id UQ, result_value (text), unit, reference_range (text), interpretation ENUM(NORMAL, LOW, HIGH, CRITICAL), technician_notes, performed_by, reviewed_by_doctor | →lab_orders CASCADE; performed_by→users SET NULL |
| lab_result_attachments | attachment_id, result_id, original_filename, stored_filename UQ, mime_type, file_size, uploaded_by | →lab_results CASCADE; →users RESTRICT |
| bills | bill_id, patient_id, admission_id, bill_date (NOT NULL), total_amount, paid_amount ≤ total, status ENUM(PENDING, PARTIAL, PAID, CANCELLED) | →patients RESTRICT; →admissions CASCADE |
| bill_items | item_id, bill_id, description, category ENUM(...) NOT NULL, quantity, unit_price, total_price | →bills CASCADE |
| bed_assignment_log | bed_id, patient_id, admission_id, assigned/released_at, status | →beds, →patients RESTRICT; →admissions CASCADE |
| doctor_daily_analytics | doctor_id, analytics_date (UQ pair), counters | →doctors CASCADE |
| surgery_requests | request_id, patient_id, doctor_id, procedure_name, priority, status | →patients, →doctors CASCADE |

**Triggers:**
- `after_admission_insert`: sets the bed OCCUPIED, increments doctor workload, inserts a bed_assignment_log row.
- `after_admission_discharge`: reverses those changes.
- `after_prescription_dispense` (prescription_items AFTER UPDATE, dispensed 0→1): decrements `medicines.stock_quantity`.
- `before_medicine_stock_update`: blocks negative stock.
- `after_bed_assignment_log`: no-op.

**Views:** available_beds_view, available_doctors_view, emergency_queue_view, current_admissions_view, hospital_occupancy_view, doctor_workload_view, pending_bills_view, bed_status_summary_view.

**Procedures:** sp_allocate_emergency, sp_admit_patient, sp_discharge_patient, sp_generate_bill, sp_get_emergency_queue. The Node code does **not** call them; allocation is done in the service.

## 3. API routes (current role checks)

"any" means any authenticated user (JWT only). "DR scoped" means DOCTOR is limited to their own rows or care set while other roles are unrestricted.

| Route | Handler | Current check |
|---|---|---|
| POST /api/auth/login | authController.login | public |
| POST /api/auth/register | authController.register | ADMIN ⚠ inserts non-existent `doctor_id` column |
| GET /api/auth/me | authController.getMe | any |
| GET /api/dashboard/stats | dashboardController.getStats | any |
| GET /api/patients | patientController.list | any; DR care set |
| POST /api/patients, PUT /:id | create / update | any |
| GET /api/patients/:id, /:id/history, /:id/admissions, /:id/appointments, /:id/prescriptions, /:id/lab-results | patientController | any; DR care set |
| GET /api/doctors, /available, /:id, /:id/schedule | doctorController | any |
| GET /api/doctors/me/analytics | getTodayAnalytics | DOCTOR |
| POST /api/doctors, PUT /:id, PUT /:id/status | doctorController | any |
| GET/POST /api/departments, GET/PUT /:id | departmentController | any ⚠ create omits NOT NULL floor |
| GET/POST /api/wards, GET /:id | wardController | any ⚠ create omits NOT NULL capacity |
| GET /api/beds, /available, /summary, /:id, /ward/:wardId; PUT /:id/status | bedController | any |
| GET/POST /api/ambulances, PUT /:id, PUT /:id/status, POST /:id/report-emergency | ambulanceController | any ⚠ create/update write `contact_number` (column is `driver_phone`) |
| POST/GET /api/emergency, /queue, /:id; PUT /:id; POST /:id/allocate | emergencyController | any |
| POST /api/appointments | appointmentController.create | any; DR own doctor_id ⚠ inserts `SCHEDULED`, omits department_id |
| GET /api/appointments, /:id, /doctor/:doctorId; PUT /:id/status | appointmentController | any; DR own (status not validated) |
| POST/GET/PUT /api/consultations, /:id, /patient/:patientId | consultationController | any; DR care set / own |
| GET/POST /api/prescriptions, /:id, /patient/:patientId | prescriptionController | any; DR scoped; create blocks PHARMACY/LAB |
| POST /api/prescriptions/:id/dispense | dispense | blocks DOCTOR/LAB only |
| GET /api/medicines | medicineRoutes | any |
| POST /api/medicines/:id/stock | medicineRoutes | PHARMACY |
| GET /api/lab/tests | labController.getTests | any |
| POST /api/lab/orders | createOrder | blocks LAB/PHARMACY; DR own + care set |
| GET /api/lab/orders | listOrders | any, unfiltered |
| PUT /api/lab/orders/:id/status, POST /results, POST /results/:orderId/attachments | labController | LABORATORY |
| GET /api/lab/results/:orderId, GET /api/lab/attachments/:id | getResult / downloadAttachment | any, **no ownership check** |
| GET/POST /api/admissions, /current, /:id; POST /:id/discharge | admissionController | any; DR own + care set |
| POST/GET /api/bills, /:id, POST /:id/items, PUT /:id/pay, /patient/:id, POST /generate/:id | billingController | any ⚠ create/addItem column mismatches; generate is a mock |
| POST /api/surgery, GET /patient/:id, PUT /:id/status | surgeryController | any; DR own + care set |

## 4. Screens by role

`client/src/App.jsx` and `components/Layout/Sidebar.jsx` define these.

| Role | Landing (`/`) | Sidebar / routes |
|---|---|---|
| ADMIN | Hospital `Dashboard` (stat cards) | Emergency, Patients, Doctors (+new), Beds, Ambulances, Appointments, Admissions, Laboratory, Pharmacy, Billing, Reports |
| DOCTOR | `DoctorDashboard` (analytics, today's appointments with CHECKED_IN→IN_PROGRESS→COMPLETED buttons, current admissions) | Patients → `PatientDetail` (tabs: Overview, Visits, Admissions, Lab Tests, Prescriptions, Surgery; modals: encounter note, lab order, prescription, surgery, admit), Appointments, Admissions |
| NURSE | Hospital `Dashboard` | Emergency, Patients, Beds, Admissions (no nursing workspace) |
| RECEPTIONIST | Hospital `Dashboard` | Emergency (+new), Patients, Doctors, Beds, Ambulances, Appointments (+new), Admissions, Billing. **No patient registration screen exists.** |
| LABORATORY | `LabDashboard` (counts, order table, enter-result modal with upload, view/download result) | Laboratory |
| PHARMACY | `PharmacyDashboard` (counts, prescription queue + dispense modal, inventory receive/adjust) | Pharmacy |

Shared components: `DataTable`, `StatCard`, `StatusBadge`, `LoadingSpinner`, `PrivateRoute`, `Layout/{Header,Sidebar,Layout}`. Styling is inline styles plus CSS variables in `index.css`/`App.css`. Toasts come from `react-hot-toast` and icons from `react-icons/fa`. `services/api.js` is an axios instance that adds the bearer token; on 401 it clears the token and redirects to `/login`.

## 5. Running and testing

- **Install:** `npm run install:all`.
- **Start:** `npm run start` (server via nodemon on port 5000, Vite on port 5173).
- ⚠ **Do not run** `npm run db:init`, `server/run_setup.js` or `server/test_seed.js`. They `DROP DATABASE hospital_db` or re-seed it, and they hard-code the root password.
- **Demo users:** all passwords are `password123`. Users: `admin`, `dr.smith` … `dr.agarwal`, `reception1`, `nurse1`, `lab_staff`, `pharmacy_staff`.
- **Legacy test scripts** (they need a running server on hospital_db and mutate it): `tests/concurrency_test.js`, `tests/load_test.js`, and the root `test_*.js/.mjs` files.
- **Automated suite** (added on `feature/his-roadmap`): `cd server && npm test`. It rebuilds the throwaway `hospital_db_test` from `database/migrations/`, starts the server against it on port 5099, and runs `server/tests/*.test.js` with `node:test`. It never touches `hospital_db`.
