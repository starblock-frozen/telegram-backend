const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  getAllTelegramUsers,
  getUserByTelegramId,
  sendNotification
} = require('../controllers/telegramController');

const router = express.Router();

router.get('/users', authenticateToken, getAllTelegramUsers);
router.get('/users/:telegram_id', authenticateToken, getUserByTelegramId);
router.post('/notify', authenticateToken, sendNotification);

module.exports = router;
