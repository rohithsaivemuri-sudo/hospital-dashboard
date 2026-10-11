const express = require('express');
const router = express.Router();
const controller = require('../controllers/appointmentController.js');
const { authorize } = require('../middleware/auth.js');

// Front desk books and manages appointments; doctors and nurses read them. Doctors start and
// finish visits through /api/encounters.
const readers = authorize('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE');
router.post('/', authorize('ADMIN', 'RECEPTIONIST'), controller.create);
router.get('/', readers, controller.list);
router.get('/:id', readers, controller.getById);
router.put('/:id/status', authorize('ADMIN', 'RECEPTIONIST'), controller.updateStatus);
router.get('/doctor/:doctorId', readers, controller.getByDoctor);
module.exports = router;
