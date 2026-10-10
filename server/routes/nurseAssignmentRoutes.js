const express = require('express');
const router = express.Router();
const controller = require('../controllers/nurseController.js');
const { authorize } = require('../middleware/auth.js');

router.get('/', authorize('ADMIN', 'NURSE'), controller.listAssignments); // nurses: their own only
router.post('/', authorize('ADMIN'), controller.createAssignment);
router.put('/:id', authorize('ADMIN'), controller.endAssignment);
module.exports = router;
