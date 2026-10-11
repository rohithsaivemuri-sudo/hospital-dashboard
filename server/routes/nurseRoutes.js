const express = require('express');
const router = express.Router();
const controller = require('../controllers/nurseController.js');
const { authorize } = require('../middleware/auth.js');

router.get('/station', authorize('NURSE'), controller.station);
module.exports = router;
