const express = require('express');
const router = express.Router();
const controller = require('../controllers/consultationController.js');

router.post('/', controller.create);
router.get('/:id', controller.getById);
router.get('/patient/:patientId', controller.getByPatient);
router.put('/:id', controller.update);
module.exports = router;
