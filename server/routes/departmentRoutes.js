const express = require('express');
const router = express.Router();
const controller = require('../controllers/departmentController.js');

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getById);
router.put('/:id', controller.update);
module.exports = router;
