const { 
  collection, 
  addDoc, 
  getDocs, 
  query,
  where
} = require('firebase/firestore');
const { db } = require('../config/firebase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const COLLECTION_NAME = 'users';

// Create users collection if it doesn't exist and add default admin
const initializeAuth = async () => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where("username", "==", "admin"));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await addDoc(collection(db, COLLECTION_NAME), {
        username: 'admin',
        password: hashedPassword,
        createdAt: new Date().toISOString()
      });
      console.log('Default admin user created');
    }
  } catch (error) {
    console.error('Error initializing auth:', error);
  }
};

// Login
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const q = query(collection(db, COLLECTION_NAME), where("username", "==", username));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();

    const isValidPassword = await bcrypt.compare(password, userData.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      { userId: userDoc.id, username: userData.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: userDoc.id,
        username: userData.username
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: error.message
    });
  }
};

// Initialize auth on startup
initializeAuth();

module.exports = {
  login
};
