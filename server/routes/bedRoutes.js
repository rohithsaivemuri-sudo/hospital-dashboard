const express = require('express');
const router = express.Router();
const controller = require('../controllers/bedController.js');
const { authorize } = require('../middleware/auth.js');

// Reads open to every role; writes limited to clinical and front-desk staff.
router.get('/', controller.list);
router.get('/available', controller.getAvailable);
router.get('/summary', controller.getSummary);
router.get('/:id', controller.getById);
router.put('/:id/status', authorize('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE'), controller.updateStatus);
router.get('/ward/:wardId', controller.getByWard);
module.exports = router;
