const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  getAllTelegramUsers,
  getUserByTelegramId,
  sendNotification,
  getAllJoinRequests
} = require('../controllers/telegramController');

const router = express.Router();

router.get('/users', authenticateToken, getAllTelegramUsers);
router.get('/users/:telegram_id', authenticateToken, getUserByTelegramId);
router.post('/notify', authenticateToken, sendNotification);
router.get('/join-requests', authenticateToken, getAllJoinRequests);

module.exports = router;
