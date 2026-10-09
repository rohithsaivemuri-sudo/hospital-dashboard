const express = require('express');
const router = express.Router();
const controller = require('../controllers/emergencyController.js');

router.post('/', controller.create);
router.get('/', controller.list);
router.get('/queue', controller.getQueue);
router.get('/:id', controller.getById);
router.put('/:id', controller.update);
router.post('/:id/allocate', controller.allocate);
module.exports = router;
