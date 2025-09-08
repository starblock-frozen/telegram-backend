const express = require('express');
const {
  getAllTickets,
  createTicket,
  updateTicket,
  deleteTicket,
  markAsRead,
  markAsSold,
  markAsCancelled,
  getNewTicketsCount,
  getTicketsByCustomerAndDomains
} = require('../controllers/ticketController');

const router = express.Router();

router.get('/', getAllTickets);
router.get('/count/new', getNewTicketsCount);
router.post('/', createTicket);
router.put('/:id', updateTicket);
router.delete('/:id', deleteTicket);
router.patch('/:id/read', markAsRead);
router.patch('/:id/sold', markAsSold);
router.patch('/:id/cancelled', markAsCancelled);
router.post('/customer-domains', getTicketsByCustomerAndDomains);


module.exports = router;
