const express = require('express');
const router = express.Router();
const controller = require('../controllers/departmentController.js');
const { authorize } = require('../middleware/auth.js');

router.get('/', controller.list);
router.post('/', authorize('ADMIN'), controller.create);
router.get('/:id', controller.getById);
router.put('/:id', authorize('ADMIN'), controller.update);
module.exports = router;
