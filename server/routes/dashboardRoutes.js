const express = require('express');
const router = express.Router();
const controller = require('../controllers/dashboardController.js');
const { authorize } = require('../middleware/auth.js');

router.get('/stats', authorize('ADMIN'), controller.getStats);
module.exports = router;
