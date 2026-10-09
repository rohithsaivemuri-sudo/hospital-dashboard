const express = require('express');
const router = express.Router();
const controller = require('../controllers/prescriptionController.js');

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getById);
router.get('/patient/:patientId', controller.getByPatient);
router.post('/:id/dispense', controller.dispense);
module.exports = router;
