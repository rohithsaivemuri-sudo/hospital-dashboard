const express = require('express');
const router = express.Router();
const controller = require('../controllers/auditLogController.js');
const { authorize } = require('../middleware/auth.js');

// Admin audit viewer: ADMIN only and read-only (no write routes; the table is append-only by trigger).
router.use(authorize('ADMIN'));
router.get('/', controller.list);
router.get('/actions', controller.actions);
module.exports = router;
