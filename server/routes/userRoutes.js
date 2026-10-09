const express = require('express');
const router = express.Router();
const controller = require('../controllers/userController.js');
const { authorize } = require('../middleware/auth.js');

// Staff account administration (accounts are created through POST /api/auth/register).
router.use(authorize('ADMIN'));
router.get('/', controller.list);
router.put('/:id/deactivate', controller.deactivate);
router.put('/:id/reactivate', controller.reactivate);
module.exports = router;
