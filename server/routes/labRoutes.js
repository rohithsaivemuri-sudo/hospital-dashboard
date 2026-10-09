const express = require('express');
const router = express.Router();
const controller = require('../controllers/labController.js');

router.get('/tests', controller.getTests);
router.post('/orders', controller.createOrder);
router.get('/orders', controller.listOrders);
router.put('/orders/:id/status', controller.updateOrderStatus);
router.post('/results', controller.addResult);
router.get('/results/:orderId', controller.getResult);
router.post('/results/:orderId/attachments', controller.uploadReport, controller.saveAttachment);
router.get('/attachments/:id', controller.downloadAttachment);
router.get('/reports/:result_id/download', controller.downloadReport);
module.exports = router;
