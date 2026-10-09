const express = require('express');
const router = express.Router();
const controller = require('../controllers/patientController.js');

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getById);
router.put('/:id', controller.update);
router.get('/:id/history', controller.getHistory);
router.get('/:id/admissions', controller.getAdmissions);
router.get('/:id/appointments', controller.getAppointments);
router.get('/:id/prescriptions', controller.getPrescriptions);
router.get('/:id/lab-results', controller.getLabResults);
module.exports = router;
