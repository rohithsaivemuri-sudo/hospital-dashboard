const express = require('express');
const router = express.Router();
const controller = require('../controllers/encounterController.js');
const { authorize } = require('../middleware/auth.js');

// Report Section E: encounters are started/finished by the assigned doctor only; check-in and
// cancellation belong to the front desk; triage to nursing.
router.get('/queue', authorize('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'), controller.queue);
router.post('/', authorize('ADMIN', 'RECEPTIONIST'), controller.arrive);
router.get('/:id', authorize('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'), controller.getById);
router.post('/:id/triage', authorize('NURSE'), controller.triage);
router.post('/:id/start', authorize('DOCTOR'), controller.start);
router.post('/:id/finish', authorize('DOCTOR'), controller.finish);
router.post('/:id/cancel', authorize('ADMIN', 'RECEPTIONIST'), controller.cancel);
router.post('/:id/entered-in-error', authorize('DOCTOR'), controller.enteredInError);
module.exports = router;
