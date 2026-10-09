const express = require('express');
const router = express.Router();
const controller = require('../controllers/surgeryController.js');

router.post('/', controller.create);
router.get('/patient/:patientId', controller.getByPatient);
router.put('/:id/status', controller.updateStatus);
module.exports = router;
