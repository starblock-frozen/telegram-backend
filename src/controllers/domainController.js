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
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

const COLLECTION_NAME = 'domains';

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Check if domain exists
const checkDomainExists = async (domainName) => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where("domainName", "==", domainName));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking domain existence:', error);
    return false;
  }
};

// Get all domains
const getAllDomains = async (req, res) => {
  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const domains = [];
    
    querySnapshot.forEach((doc) => {
      domains.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log(domains);
    res.status(200).json({
      success: true,
      data: domains
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: 'Error fetching domains',
      error: error.message
    });
  }
};

// Create new domains (multiple domains support)
const createDomains = async (req, res) => {
  try {
    const {
      domains, // Array of domain objects
      panelLink,
      panelUsername,
      panelPassword,
      hostingLink,
      hostingUsername,
      hostingPassword
    } = req.body;

    // Validation
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Domains array is required'
      });
    }

    const createdDomains = [];
    const errors = [];

    for (let i = 0; i < domains.length; i++) {
      const domainInfo = domains[i];
      const {
        domainName,
        country,
        category,
        da,
        pa,
        ss,
        backlink,
        price,
        status,
        goodLink,
        ischannel
      } = domainInfo;

      // Validation for each domain
      if (!domainName || !country || !category || !price) {
        errors.push({
          index: i,
          error: 'Required fields: domainName, country, category, price',
          domain: domainInfo
        });
        continue;
      }

      // Check if domain already exists
      const domainExists = await checkDomainExists(domainName);
      if (domainExists) {
        errors.push({
          index: i,
          error: `Domain '${domainName}' already exists`,
          domain: domainInfo
        });
        continue;
      }

      try {
        const domainData = {
          domainName,
          country,
          category,
          da: parseInt(da) || 0,
          pa: parseInt(pa) || 0,
          ss: parseInt(ss) || 0,
          backlink: parseInt(backlink) || 0,
          price: parseFloat(price),
          status: status === true || status === 'true',
          panelLink: panelLink || '',
          panelUsername: panelUsername || '',
          panelPassword: panelPassword || '',
          goodLink: goodLink || '',
          hostingLink: hostingLink || '',
          hostingUsername: hostingUsername || '',
          hostingPassword: hostingPassword || '',
          ischannel: ischannel === true || ischannel === 'true',
          postDateTime: (ischannel === true || ischannel === 'true') ? new Date().toISOString() : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const docRef = await addDoc(collection(db, COLLECTION_NAME), domainData);
        createdDomains.push({
          id: docRef.id,
          ...domainData
        });
      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          domain: domainInfo
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `${createdDomains.length} domains created successfully`,
      data: {
        created: createdDomains,
        errors: errors
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating domains',
      error: error.message
    });
  }
};

// Create single domain (for backward compatibility)
const createDomain = async (req, res) => {
  try {
    const {
      domainName,
      country,
      category,
      da,
      pa,
      ss,
      backlink,
      price,
      status,
      panelLink,
      panelUsername,
      panelPassword,
      goodLink,
      hostingLink,
      hostingUsername,
      hostingPassword,
      ischannel
    } = req.body;

    // Validation
    if (!domainName || !country || !category || !price) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: domainName, country, category, price'
      });
    }

    // Check if domain already exists
    const domainExists = await checkDomainExists(domainName);
    if (domainExists) {
      return res.status(409).json({
        success: false,
        message: `Domain '${domainName}' already exists`
      });
    }

    const domainData = {
      domainName,
      country,
      category,
      da: parseInt(da) || 0,
      pa: parseInt(pa) || 0,
      ss: parseInt(ss) || 0,
      backlink: parseInt(backlink) || 0,
      price: parseFloat(price),
      status: status === true || status === 'true',
      panelLink: panelLink || '',
      panelUsername: panelUsername || '',
      panelPassword: panelPassword || '',
      goodLink: goodLink || '',
      hostingLink: hostingLink || '',
      hostingUsername: hostingUsername || '',
      hostingPassword: hostingPassword || '',
      ischannel: ischannel === true || ischannel === 'true',
      postDateTime: (ischannel === true || ischannel === 'true') ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), domainData);
    
    res.status(201).json({
      success: true,
      message: 'Domain created successfully',
      data: {
        id: docRef.id,
        ...domainData
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating domain',
      error: error.message
    });
  }
};

// Import domains from CSV
const importDomainsFromCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No CSV file uploaded'
      });
    }

    const results = [];
    const errors = [];
    const duplicates = [];
    const successful = [];

    // Read and parse CSV file
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          // Validate CSV format
          const requiredColumns = ['Domain Name', 'Country', 'Category', 'Price'];
          const csvColumns = Object.keys(results[0] || {});
          
          const missingColumns = requiredColumns.filter(col => !csvColumns.includes(col));
          if (missingColumns.length > 0) {
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
              success: false,
              message: `Invalid CSV format. Missing columns: ${missingColumns.join(', ')}`,
              expectedFormat: 'Domain Name, Country, Category, DA, PA, SS, Backlinks, Price, Status, Panel Link, Panel Username, Panel Password, Shell Link, Hosting Link, Hosting Username, Hosting Password, Ischannel'
            });
          }

          // Process each row
          for (let i = 0; i < results.length; i++) {
            const row = results[i];
            const domainName = row['Domain Name']?.trim();
            
            if (!domainName) {
              errors.push({
                row: i + 1,
                error: 'Domain Name is required',
                data: row
              });
              continue;
            }

            // Check for duplicates
            const domainExists = await checkDomainExists(domainName);
            if (domainExists) {
              duplicates.push({
                row: i + 1,
                domainName: domainName,
                data: row
              });
              continue;
            }

            // Validate required fields
            if (!row['Country']?.trim() || !row['Category']?.trim() || !row['Price']) {
              errors.push({
                row: i + 1,
                error: 'Missing required fields (Country, Category, or Price)',
                data: row
              });
              continue;
            }

            try {
              const ischannelValue = row['Ischannel'] === 'true' || row['Ischannel'] === true || row['Ischannel'] === 'Posted';
              
              const domainData = {
                domainName: domainName,
                country: row['Country']?.trim() || '',
                category: row['Category']?.trim() || '',
                da: parseInt(row['DA']) || 0,
                pa: parseInt(row['PA']) || 0,
                ss: parseInt(row['SS']) || 0,
                backlink: parseInt(row['Backlinks']) || 0,
                price: parseFloat(row['Price']) || 0,
                status: row['Status'] === 'Available' || row['Status'] === 'true' || row['Status'] === true,
                panelLink: row['Panel Link']?.trim() || '',
                panelUsername: row['Panel Username']?.trim() || '',
                panelPassword: row['Panel Password']?.trim() || '',
                goodLink: row['Shell Link']?.trim() || '',
                hostingLink: row['Hosting Link']?.trim() || '',
                hostingUsername: row['Hosting Username']?.trim() || '',
                hostingPassword: row['Hosting Password']?.trim() || '',
                ischannel: ischannelValue,
                postDateTime: ischannelValue ? new Date().toISOString() : null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };

              // Validate price
              if (domainData.price <= 0) {
                errors.push({
                  row: i + 1,
                  error: 'Price must be greater than 0',
                  data: row
                });
                continue;
              }

              // Add to Firestore
              const docRef = await addDoc(collection(db, COLLECTION_NAME), domainData);
              successful.push({
                row: i + 1,
                domainName: domainName,
                id: docRef.id
              });

            } catch (error) {
              errors.push({
                row: i + 1,
                error: error.message,
                data: row
              });
            }
          }

          // Clean up uploaded file
          fs.unlinkSync(req.file.path);

          // Send response
          res.status(200).json({
            success: true,
            message: 'CSV import completed',
            summary: {
              totalRows: results.length,
              successful: successful.length,
              duplicates: duplicates.length,
              errors: errors.length
            },
            details: {
              successful,
              duplicates,
              errors
            }
          });

        } catch (error) {
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
          res.status(500).json({
            success: false,
            message: 'Error processing CSV file',
            error: error.message
          });
        }
      })
      .on('error', (error) => {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        res.status(500).json({
          success: false,
          message: 'Error reading CSV file',
          error: error.message
        });
      });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error importing domains',
      error: error.message
    });
  }
};

// Update domain
const updateDomain = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // If domainName is being updated, check for duplicates
    if (updateData.domainName) {
      const domainExists = await checkDomainExists(updateData.domainName);
      if (domainExists) {
        // Check if it's the same domain being updated
        const currentDoc = await getDoc(doc(db, COLLECTION_NAME, id));
        if (currentDoc.exists() && currentDoc.data().domainName !== updateData.domainName) {
          return res.status(409).json({
            success: false,
            message: `Domain '${updateData.domainName}' already exists`
          });
        }
      }
    }
    
    // Convert numeric fields
    if (updateData.da) updateData.da = parseInt(updateData.da);
    if (updateData.pa) updateData.pa = parseInt(updateData.pa);
    if (updateData.ss) updateData.ss = parseInt(updateData.ss);
    if (updateData.backlink) updateData.backlink = parseInt(updateData.backlink);
    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.status !== undefined) updateData.status = updateData.status === true || updateData.status === 'true';
    
    // Handle ischannel and postDateTime
    if (updateData.ischannel !== undefined) {
      updateData.ischannel = updateData.ischannel === true || updateData.ischannel === 'true';
      updateData.postDateTime = updateData.ischannel ? new Date().toISOString() : null;
    }
    
    updateData.updatedAt = new Date().toISOString();

    const domainRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(domainRef, updateData);
    
    res.status(200).json({
      success: true,
      message: 'Domain updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating domain',
      error: error.message
    });
  }
};

// Delete domain
const deleteDomain = async (req, res) => {
  try {
    const { id } = req.params;
    
    await deleteDoc(doc(db, COLLECTION_NAME, id));
    
    res.status(200).json({
      success: true,
      message: 'Domain deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting domain',
      error: error.message
    });
  }
};

// Mark as sold
const markAsSold = async (req, res) => {
  try {
    const { id } = req.params;
    
    const domainRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(domainRef, {
      status: false,
      updatedAt: new Date().toISOString()
    });
    
    res.status(200).json({
      success: true,
      message: 'Domain marked as sold'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error marking domain as sold',
      error: error.message
    });
  }
};

// Mark as available
const markAsAvailable = async (req, res) => {
  try {
    const { id } = req.params;
    
    const domainRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(domainRef, {
      status: true,
      updatedAt: new Date().toISOString()
    });
    
    res.status(200).json({
      success: true,
      message: 'Domain marked as available'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error marking domain as available',
      error: error.message
    });
  }
};

// Post to channel
const postToChannel = async (req, res) => {
  try {
    const { id } = req.params;
    
    const domainRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(domainRef, {
      ischannel: true,
      postDateTime: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    res.status(200).json({
      success: true,
      message: 'Domain posted to channel'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error posting domain to channel',
      error: error.message
    });
  }
};

// Remove from channel
const removeFromChannel = async (req, res) => {
  try {
    const { id } = req.params;
    
    const domainRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(domainRef, {
      ischannel: false,
      postDateTime: null,
      updatedAt: new Date().toISOString()
    });
    
    res.status(200).json({
      success: true,
      message: 'Domain removed from channel'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error removing domain from channel',
      error: error.message
    });
  }
};

const getPublicDomains = async (req, res) => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME), 
      where("ischannel", "==", true),
      orderBy("postDateTime", "desc")
    );
    const querySnapshot = await getDocs(q);
    const domains = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Only return public information
      domains.push({
        id: doc.id,
        domainName: data.domainName,
        country: data.country,
        category: data.category,
        da: data.da || 0,
        pa: data.pa || 0,
        ss: data.ss || 0,
        backlink: data.backlink || 0,
        price: data.price,
        status: data.status,
        postDateTime: data.postDateTime,
        createdAt: data.createdAt
      });
    });

    res.status(200).json({
      success: true,
      data: domains
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching public domains',
      error: error.message
    });
  }
};

module.exports = {
  getAllDomains,
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
  upload
};
