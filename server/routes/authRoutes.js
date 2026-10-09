const express = require('express');
const router = express.Router();
const controller = require('../controllers/authController.js');
const { verifyToken, authorize } = require('../middleware/auth.js');

router.post('/login', controller.login);
router.post('/register', verifyToken, authorize('ADMIN'), controller.register);
router.get('/me', verifyToken, controller.getMe);
module.exports = router;
