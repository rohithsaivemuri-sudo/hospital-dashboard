const express = require('express');
const router = express.Router();
const controller = require('../controllers/admissionController.js');

router.get('/', controller.list);
router.get('/current', controller.getCurrent);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.post('/:id/discharge', controller.discharge);
module.exports = router;
