const express = require('express');
const router = express.Router();
const controller = require('../controllers/consultationController.js');
const { authorize } = require('../middleware/auth.js');

// Clinical notes: the patient's doctors only (care set checked in the controller).
router.use(authorize('DOCTOR'));
router.post('/', controller.create);
router.get('/:id', controller.getById);
router.get('/patient/:patientId', controller.getByPatient);
router.put('/:id', controller.update);
module.exports = router;
