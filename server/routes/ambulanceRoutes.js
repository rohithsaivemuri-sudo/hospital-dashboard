const express = require('express');
const router = express.Router();
const controller = require('../controllers/ambulanceController.js');

router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.put('/:id/status', controller.updateStatus);
router.post('/:id/report-emergency', controller.reportEmergency);
module.exports = router;
