const express = require('express');
const router = express.Router();
const controller = require('../controllers/labController.js');
const { authorize } = require('../middleware/auth.js');

const lab = authorize('LABORATORY');
const resultReaders = authorize('LABORATORY', 'DOCTOR', 'NURSE'); // patient scope checked in the controller
router.get('/tests', authorize('ADMIN', 'DOCTOR', 'NURSE', 'LABORATORY'), controller.getTests);
router.post('/orders', authorize('DOCTOR'), controller.createOrder);
router.get('/orders', resultReaders, controller.listOrders);
router.put('/orders/:id/status', lab, controller.updateOrderStatus);
router.post('/results', lab, controller.addResult);
router.get('/results/:orderId', resultReaders, controller.getResult);
// Role is checked before the upload middleware, so a rejected request never writes a file.
router.post('/results/:orderId/attachments', lab, controller.uploadReport, controller.saveAttachment);
router.get('/attachments/:id', resultReaders, controller.downloadAttachment);
router.get('/reports/:result_id/download', resultReaders, controller.downloadReport);
module.exports = router;
