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

const createTicket = async (req, res) => {
  try {
    const {
      customer_id,
      request_domains,
      price,
      status = 'New',
      note
    } = req.body;

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
      note: note || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), ticketData);
    
    const newTicket = {
      id: docRef.id,
      ...ticketData
    };

    // Broadcast new ticket to all connected WebSocket clients
    if (global.broadcastNewTicket) {
      global.broadcastNewTicket(newTicket);
    }
    
    res.status(201).json({
      success: true,
      message: 'Ticket created successfully',
      data: newTicket
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating ticket',
      error: error.message
    });
  }
};

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

const updateNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    
    const ticketRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(ticketRef, {
      note: note || '',
      updatedAt: new Date().toISOString()
    });
    
    res.status(200).json({
      success: true,
      message: 'Note updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating note',
      error: error.message
    });
  }
};

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

const markDomainsAsSold = async (domainNames) => {
  const results = {
    updated: [],
    notFound: [],
    errors: []
  };

  for (const domainName of domainNames) {
    try {
      const q = query(collection(db, DOMAINS_COLLECTION), where("domainName", "==", domainName));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        results.notFound.push(domainName);
        continue;
      }

      const updatePromises = [];
      querySnapshot.forEach((domainDoc) => {
        const domainRef = doc(db, DOMAINS_COLLECTION, domainDoc.id);
        updatePromises.push(
          updateDoc(domainRef, {
            status: false,
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

const markAsSold = async (req, res) => {
  try {
    const { id } = req.params;
    const { price, soldDomains, note } = req.body;
    
    const ticketRef = doc(db, COLLECTION_NAME, id);
    const ticketDoc = await getDoc(ticketRef);
    
    if (!ticketDoc.exists()) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const ticketData = ticketDoc.data();
    let domainsToProcess = ticketData.request_domains || [];
    let updatedRequestDomains = [...domainsToProcess];

    if (soldDomains && Array.isArray(soldDomains)) {
      const soldDomainNames = soldDomains.filter(item => item.sold).map(item => item.domain);
      const notSoldDomainNames = soldDomains.filter(item => !item.sold).map(item => item.domain);
      
      domainsToProcess = soldDomainNames;
      updatedRequestDomains = updatedRequestDomains.filter(domain => !notSoldDomainNames.includes(domain));
    }

    const updateData = {
      status: 'Sold',
      price: parseFloat(price) || 0,
      request_domains: updatedRequestDomains,
      updatedAt: new Date().toISOString()
    };

    if (note !== undefined) {
      updateData.note = note;
    }

    await updateDoc(ticketRef, updateData);

    let domainUpdateResults = { updated: [], notFound: [], errors: [] };
    if (domainsToProcess.length > 0) {
      domainUpdateResults = await markDomainsAsSold(domainsToProcess);
    }
    
    res.status(200).json({
      success: true,
      message: 'Ticket marked as sold',
      domainUpdates: domainUpdateResults
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error marking ticket as sold',
      error: error.message
    });
  }
};

const markAsCancelled = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    
    const updateData = {
      status: 'Cancelled',
      updatedAt: new Date().toISOString()
    };

    if (note !== undefined) {
      updateData.note = note;
    }

    const ticketRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(ticketRef, updateData);
    
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
      message: 'Error fetching new tickets count',
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
    
    const q = query(
      collection(db, COLLECTION_NAME), 
      where("customer_id", "==", customer_id),
      orderBy("request_time", "desc")
    );

    const querySnapshot = await getDocs(q);

    console.log('Customer ID:', customer_id, 'Domains:', domains);

    querySnapshot.forEach((doc) => {
      const ticketData = doc.data();
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
    console.error('Error fetching tickets by customer and domains:', error);
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
  updateNote,
  deleteTicket,
  markAsRead,
  markAsSold,
  markAsCancelled,
  getNewTicketsCount,
  getTicketsByCustomerAndDomains
};
