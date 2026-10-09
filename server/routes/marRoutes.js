const express = require('express');
const router = express.Router();
const controller = require('../controllers/marController.js');
const { authorize } = require('../middleware/auth.js');

// Medication Administration Record. Nurses record doses for their assigned patients; the
// patient's doctors can read it (patient scope checked in the controller).
router.get('/patients/:patientId', authorize('NURSE', 'DOCTOR'), controller.patientMar);
router.post('/doses/:id/administer', authorize('NURSE'), controller.administer);
router.post('/doses/:id/refuse', authorize('NURSE'), controller.refuse);
router.post('/doses/:id/missed', authorize('NURSE'), controller.missed);
router.post('/items/:itemId/given', authorize('NURSE'), controller.givenAsNeeded);
module.exports = router;
