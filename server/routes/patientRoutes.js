const express = require('express');
const router = express.Router();
const controller = require('../controllers/patientController.js');
const { authorize } = require('../middleware/auth.js');

// Report Section E. Patient-level scoping (DR*, NU*) is enforced in the controller.
router.get('/', authorize('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE'), controller.list);
router.post('/', authorize('ADMIN', 'RECEPTIONIST'), controller.create);
router.get('/:id', authorize('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE'), controller.getById);
router.put('/:id', authorize('ADMIN', 'RECEPTIONIST'), controller.update);
router.get('/:id/history', authorize('DOCTOR', 'NURSE'), controller.getHistory);
router.get('/:id/admissions', authorize('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE'), controller.getAdmissions);
router.get('/:id/appointments', authorize('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE'), controller.getAppointments);
router.get('/:id/prescriptions', authorize('DOCTOR', 'NURSE', 'PHARMACY'), controller.getPrescriptions);
router.get('/:id/lab-results', authorize('DOCTOR', 'NURSE', 'LABORATORY'), controller.getLabResults);
module.exports = router;
