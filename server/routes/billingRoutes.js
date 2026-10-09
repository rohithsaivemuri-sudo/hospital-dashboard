const express = require('express');
const router = express.Router();
const controller = require('../controllers/billingController.js');
const { authorize } = require('../middleware/auth.js');

router.use(authorize('ADMIN', 'RECEPTIONIST'));
router.post('/', controller.create);
router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/:id/items', controller.addItem);
router.put('/:id/pay', controller.pay);
router.get('/patient/:patientId', controller.getByPatient);
router.post('/generate/:admissionId', controller.generate);
module.exports = router;
