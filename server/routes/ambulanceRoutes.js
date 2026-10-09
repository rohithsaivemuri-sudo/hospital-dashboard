const express = require('express');
const router = express.Router();
const controller = require('../controllers/ambulanceController.js');
const { authorize } = require('../middleware/auth.js');

const staff = authorize('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE');
// Reads open to every role; writes limited to clinical and front-desk staff.
router.get('/', controller.list);
router.post('/', staff, controller.create);
router.put('/:id', staff, controller.update);
router.put('/:id/status', staff, controller.updateStatus);
router.post('/:id/report-emergency', staff, controller.reportEmergency);
module.exports = router;
