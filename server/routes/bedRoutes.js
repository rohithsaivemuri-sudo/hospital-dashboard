const express = require('express');
const router = express.Router();
const controller = require('../controllers/bedController.js');

router.get('/', controller.list);
router.get('/available', controller.getAvailable);
router.get('/summary', controller.getSummary);
router.get('/:id', controller.getById);
router.put('/:id/status', controller.updateStatus);
router.get('/ward/:wardId', controller.getByWard);
module.exports = router;
