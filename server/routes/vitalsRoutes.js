const express = require('express');
const router = express.Router();
const controller = require('../controllers/vitalsController.js');
const { authorize } = require('../middleware/auth.js');

// Vitals: nurses record; nurses and doctors read. Patient-level scoping is in the controller.
router.post('/', authorize('NURSE'), controller.record);
router.get('/patients/:patientId', authorize('NURSE', 'DOCTOR'), controller.listForPatient);
module.exports = router;
