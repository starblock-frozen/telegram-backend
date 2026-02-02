const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  getAllTelegramUsers,
  getUserByTelegramId,
  sendNotification,
  getAllJoinRequests,
  deleteTelegramUser  // ADD THIS
} = require('../controllers/telegramController');

const router = express.Router();

router.get('/users', authenticateToken, getAllTelegramUsers);
router.get('/users/:telegram_id', authenticateToken, getUserByTelegramId);
router.post('/notify', authenticateToken, sendNotification);
router.get('/join-requests', authenticateToken, getAllJoinRequests);
router.delete('/users/:id', authenticateToken, deleteTelegramUser);  // ADD THIS

module.exports = router;
