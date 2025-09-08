const { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  getDoc,
  query,
  where,
  orderBy
} = require('firebase/firestore');
const { db } = require('../config/firebase');

const COLLECTION_NAME = 'tickets';
const DOMAINS_COLLECTION = 'domains';

// Get all tickets
const getAllTickets = async (req, res) => {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy("request_time", "desc"));
    const querySnapshot = await getDocs(q);
    const tickets = [];
    
    querySnapshot.forEach((doc) => {
      tickets.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.status(200).json({
      success: true,
      data: tickets
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tickets',
      error: error.message
    });
  }
};

// Create new ticket
const createTicket = async (req, res) => {
  try {
    const {
      customer_id,
      request_domains, // Array of domain names
      price,
      status = 'New'
    } = req.body;

    // Validation
    if (!customer_id || !request_domains || !Array.isArray(request_domains) || request_domains.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: customer_id, request_domains (array)'
      });
    }

    const ticketData = {
      customer_id,
      request_domains,
      request_time: new Date().toISOString(),
      price: parseFloat(price) || 0,
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), ticketData);
    
    res.status(201).json({
      success: true,
      message: 'Ticket created successfully',
      data: {
        id: docRef.id,
        ...ticketData
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating ticket',
      error: error.message
    });
  }
};

// Update ticket
const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    if (updateData.price) updateData.price = parseFloat(updateData.price);
    updateData.updatedAt = new Date().toISOString();

    const ticketRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(ticketRef, updateData);
    
    res.status(200).json({
      success: true,
      message: 'Ticket updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating ticket',
      error: error.message
    });
  }
};

// Delete ticket
const deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;
    
    await deleteDoc(doc(db, COLLECTION_NAME, id));
    
    res.status(200).json({
      success: true,
      message: 'Ticket deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting ticket',
      error: error.message
    });
  }
};

// Mark ticket as read
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const ticketRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(ticketRef, {
      status: 'Read',
      updatedAt: new Date().toISOString()
    });
    
    res.status(200).json({
      success: true,
      message: 'Ticket marked as read'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error marking ticket as read',
      error: error.message
    });
  }
};

// Helper function to mark domains as sold
const markDomainsAsSold = async (domainNames) => {
  const results = {
    updated: [],
    notFound: [],
    errors: []
  };

  for (const domainName of domainNames) {
    try {
      // Find domain by name
      const q = query(collection(db, DOMAINS_COLLECTION), where("domainName", "==", domainName));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        results.notFound.push(domainName);
        continue;
      }

      // Update all matching domains (in case of duplicates)
      const updatePromises = [];
      querySnapshot.forEach((domainDoc) => {
        const domainRef = doc(db, DOMAINS_COLLECTION, domainDoc.id);
        updatePromises.push(
          updateDoc(domainRef, {
            status: false, // Mark as sold (false = not available)
            updatedAt: new Date().toISOString()
          })
        );
      });

      await Promise.all(updatePromises);
      results.updated.push(domainName);

    } catch (error) {
      results.errors.push({
        domainName,
        error: error.message
      });
    }
  }

  return results;
};

// Mark ticket as sold (Updated to also mark domains as sold)
const markAsSold = async (req, res) => {
  try {
    const { id } = req.params;
    const { price } = req.body;
    
    // First, get the ticket to access the domain names
    const ticketRef = doc(db, COLLECTION_NAME, id);
    const ticketDoc = await getDoc(ticketRef);
    
    if (!ticketDoc.exists()) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const ticketData = ticketDoc.data();
    const requestDomains = ticketData.request_domains || [];

    // Update ticket status
    await updateDoc(ticketRef, {
      status: 'Sold',
      price: parseFloat(price) || 0,
      updatedAt: new Date().toISOString()
    });

    // Mark corresponding domains as sold
    let domainUpdateResults = { updated: [], notFound: [], errors: [] };
    if (requestDomains.length > 0) {
      domainUpdateResults = await markDomainsAsSold(requestDomains);
    }

    res.status(200).json({
      success: true,
      message: 'Ticket marked as sold',
      domainUpdates: {
        totalDomains: requestDomains.length,
        updated: domainUpdateResults.updated.length,
        notFound: domainUpdateResults.notFound.length,
        errors: domainUpdateResults.errors.length,
        details: domainUpdateResults
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error marking ticket as sold',
      error: error.message
    });
  }
};

// Mark ticket as cancelled
const markAsCancelled = async (req, res) => {
  try {
    const { id } = req.params;
    
    const ticketRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(ticketRef, {
      status: 'Cancelled',
      updatedAt: new Date().toISOString()
    });
    
    res.status(200).json({
      success: true,
      message: 'Ticket marked as cancelled'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error marking ticket as cancelled',
      error: error.message
    });
  }
};

// Get new tickets count
const getNewTicketsCount = async (req, res) => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where("status", "==", "New"));
    const querySnapshot = await getDocs(q);
    
    res.status(200).json({
      success: true,
      count: querySnapshot.size
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error getting new tickets count',
      error: error.message
    });
  }
};

const getTicketsByCustomerAndDomains = async (req, res) => {
  try {
    const { customer_id, domains } = req.body;
    
    if (!customer_id || !domains || !Array.isArray(domains)) {
      return res.status(400).json({
        success: false,
        message: 'customer_id and domains array are required'
      });
    }

    const tickets = [];
    
    // Get all tickets for this customer
    const q = query(
      collection(db, COLLECTION_NAME), 
      where("customer_id", "==", customer_id),
      orderBy("request_time", "desc")
    );

    const querySnapshot = await getDocs(q);

    console.log(customer_id, ":::", domains);

    querySnapshot.forEach((doc) => {
      const ticketData = doc.data();
      // Check if any requested domain matches our domains
      const matchingDomains = ticketData.request_domains.filter(domain => 
        domains.includes(domain)
      );
      
      if (matchingDomains.length > 0) {
        tickets.push({
          id: doc.id,
          ...ticketData,
          matchingDomains
        });
      }
    });

    res.status(200).json({
      success: true,
      data: tickets
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tickets',
      error: error.message
    });
  }
};

module.exports = {
  getAllTickets,
  createTicket,
  updateTicket,
  deleteTicket,
  markAsRead,
  markAsSold,
  markAsCancelled,
  getNewTicketsCount,
  getTicketsByCustomerAndDomains
};
