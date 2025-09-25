const express = require('express');
const router = express.Router();
const {
  getAllDomains, // New endpoint for all domains
  getAdminDomains, // Renamed from getAllDomains
  createDomain,
  createDomains,
  importDomainsFromCSV,
  updateDomain,
  deleteDomain,
  markAsSold,
  markAsAvailable,
  postToChannel,
  removeFromChannel,
  getPublicDomains,
  bulkActions,
  upload
} = require('../controllers/domainController');
const { authenticateToken } = require('../middleware/auth');

// Public routes (no authentication required)
router.get('/public', getPublicDomains);
router.get('/all', getAllDomains); // New public endpoint for all domains

// Apply authentication middleware to protected routes
router.use(authenticateToken);

// Protected routes (for admin panel)
router.get('/', getAdminDomains); // Admin endpoint
router.post('/', createDomain);
router.post('/multiple', createDomains);
router.post('/import', upload.single('csvFile'), importDomainsFromCSV);
router.post('/bulk-actions', bulkActions);
router.put('/:id', updateDomain);
router.delete('/:id', deleteDomain);
router.patch('/:id/sold', markAsSold);
router.patch('/:id/available', markAsAvailable);
router.patch('/:id/post', postToChannel);
router.patch('/:id/unpost', removeFromChannel);

module.exports = router;
