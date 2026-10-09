const express = require('express');
const router = express.Router();
const controller = require('../controllers/appointmentController.js');

router.post('/', controller.create);
router.get('/', controller.list);
router.get('/:id', controller.getById);
router.put('/:id/status', controller.updateStatus);
router.get('/doctor/:doctorId', controller.getByDoctor);
module.exports = router;
