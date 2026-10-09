const express = require('express');
const router = express.Router();
const controller = require('../controllers/prescriptionController.js');
const { authorize } = require('../middleware/auth.js');

const readers = authorize('DOCTOR', 'NURSE', 'PHARMACY');
router.get('/', readers, controller.list);
router.post('/', authorize('DOCTOR'), controller.create);
router.get('/:id', readers, controller.getById);
router.get('/patient/:patientId', readers, controller.getByPatient);
router.post('/:id/dispense', authorize('PHARMACY'), controller.dispense);
module.exports = router;
