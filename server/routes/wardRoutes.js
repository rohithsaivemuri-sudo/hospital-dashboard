const express = require('express');
const router = express.Router();
const controller = require('../controllers/wardController.js');
const { authorize } = require('../middleware/auth.js');

router.get('/', controller.list);
router.post('/', authorize('ADMIN'), controller.create);
router.get('/:id', controller.getById);
module.exports = router;
