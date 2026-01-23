const express = require('express');
const {
  getAllComments,
  createComment,
  markAsRead,
  getNewCommentsCount,
  deleteComment
} = require('../controllers/commentController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Public route - create comment
router.post('/', createComment);

// Protected routes - admin only
router.get('/', authenticateToken, getAllComments);
router.get('/count/new', authenticateToken, getNewCommentsCount);
router.patch('/:id/read', authenticateToken, markAsRead);
router.delete('/:id', authenticateToken, deleteComment);

module.exports = router;
