const express = require('express');
const router = express.Router();
const controller = require('../controllers/wardController.js');

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getById);
module.exports = router;
