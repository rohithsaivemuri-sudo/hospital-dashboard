const express = require('express');
const router = express.Router();
const controller = require('../controllers/doctorController.js');
const { authorize } = require('../middleware/auth.js');

router.get('/', controller.list);
router.get('/me/analytics', authorize('DOCTOR'), controller.getTodayAnalytics);
router.get('/available', controller.getAvailable);
router.post('/', authorize('ADMIN'), controller.create);
router.get('/:id', controller.getById);
router.put('/:id', authorize('ADMIN'), controller.update);
router.get('/:id/schedule', controller.getSchedule);
router.put('/:id/status', authorize('ADMIN', 'DOCTOR'), controller.updateStatus); // doctors: own record only
module.exports = router;
