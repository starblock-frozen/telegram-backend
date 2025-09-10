const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  getAllTelegramUsers,
  getUserByTelegramId
} = require('../controllers/telegramController');

const router = express.Router();

// Protected routes (require authentication)
router.get('/users', authenticateToken, getAllTelegramUsers);
router.get('/users/:telegram_id', authenticateToken, getUserByTelegramId);

module.exports = router;
