const express = require('express');
const {
  getAllTickets,
  createTicket,
  updateTicket,
  updateNote,
  deleteTicket,
  markAsRead,
  markAsSold,
  markAsCancelled,
  getNewTicketsCount,
  getTicketsByCustomerAndDomains
} = require('../controllers/ticketController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Public routes (no authentication required) - used by frontend
router.post('/', createTicket);
router.post('/customer-domains', getTicketsByCustomerAndDomains);

// Protected routes (authentication required) - used by admin panel
router.get('/', authenticateToken, getAllTickets);
router.get('/count/new', authenticateToken, getNewTicketsCount);
router.put('/:id', authenticateToken, updateTicket);
router.patch('/:id/note', authenticateToken, updateNote);
router.delete('/:id', authenticateToken, deleteTicket);
router.patch('/:id/read', authenticateToken, markAsRead);
router.patch('/:id/sold', authenticateToken, markAsSold);
router.patch('/:id/cancelled', authenticateToken, markAsCancelled);

module.exports = router;
