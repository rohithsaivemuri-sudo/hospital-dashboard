const express = require('express');
const router = express.Router();
const controller = require('../controllers/admissionController.js');
const { authorize } = require('../middleware/auth.js');

const readers = authorize('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE');
router.get('/', readers, controller.list);
router.get('/current', readers, controller.getCurrent);
router.get('/:id', readers, controller.getById);
router.post('/', authorize('ADMIN', 'RECEPTIONIST', 'DOCTOR'), controller.create);
router.post('/:id/discharge', authorize('ADMIN', 'DOCTOR'), controller.discharge); // doctors: own patients only
module.exports = router;
