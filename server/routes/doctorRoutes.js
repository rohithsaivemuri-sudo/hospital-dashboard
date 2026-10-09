const express = require('express');
const router = express.Router();
const controller = require('../controllers/doctorController.js');

router.get('/', controller.list);
router.get('/me/analytics', controller.getTodayAnalytics);
router.get('/available', controller.getAvailable);
router.post('/', controller.create);
router.get('/:id', controller.getById);
router.put('/:id', controller.update);
router.get('/:id/schedule', controller.getSchedule);
router.put('/:id/status', controller.updateStatus);
module.exports = router;
