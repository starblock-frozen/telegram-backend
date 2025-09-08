const express = require('express');
const {
  getAllDomains,
  getPublicDomains,
  createDomain,
  createDomains,
  importDomainsFromCSV,
  updateDomain,
  deleteDomain,
  markAsSold,
  markAsAvailable,
  postToChannel,
  removeFromChannel,
  upload
} = require('../controllers/domainController');

const router = express.Router();

router.get('/', getAllDomains);
router.get('/public', getPublicDomains);
router.post('/', createDomain);
router.post('/multiple', createDomains);
router.post('/import', upload.single('csvFile'), importDomainsFromCSV);
router.put('/:id', updateDomain);
router.delete('/:id', deleteDomain);
router.patch('/:id/sold', markAsSold);
router.patch('/:id/available', markAsAvailable);
router.patch('/:id/post', postToChannel);
router.patch('/:id/unpost', removeFromChannel);

module.exports = router;
