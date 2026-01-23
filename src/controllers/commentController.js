const { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc,
  deleteDoc,  // ADD THIS IMPORT
  query,
  orderBy,
  where
} = require('firebase/firestore');
const { db } = require('../config/firebase');

const COLLECTION_NAME = 'comments';

// Get all comments
const getAllComments = async (req, res) => {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    const comments = [];
    
    querySnapshot.forEach((doc) => {
      comments.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.status(200).json({
      success: true,
      data: comments
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching comments',
      error: error.message
    });
  }
};

// Create new comment
const createComment = async (req, res) => {
  try {
    const { telegram_username, content } = req.body;

    if (!telegram_username || !content) {
      return res.status(400).json({
        success: false,
        message: 'Telegram username and content are required'
      });
    }

    const commentData = {
      telegram_username,
      content,
      status: 'New',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), commentData);
    
    const newComment = {
      id: docRef.id,
      ...commentData
    };

    // Broadcast new comment to all connected WebSocket clients
    if (global.broadcastNewComment) {
      global.broadcastNewComment(newComment);
    }
    
    res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      data: newComment
    });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating comment',
      error: error.message
    });
  }
};

// Mark comment as read
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const commentRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(commentRef, {
      status: 'Read',
      updatedAt: new Date().toISOString()
    });
    
    res.status(200).json({
      success: true,
      message: 'Comment marked as read'
    });
  } catch (error) {
    console.error('Error marking comment as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking comment as read',
      error: error.message
    });
  }
};

// Get new comments count
const getNewCommentsCount = async (req, res) => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where("status", "==", "New"));
    const querySnapshot = await getDocs(q);
    
    res.status(200).json({
      success: true,
      count: querySnapshot.size
    });
  } catch (error) {
    console.error('Error fetching new comments count:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching new comments count',
      error: error.message
    });
  }
};

// Delete comment
const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if comment exists before deleting
    const commentRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(commentRef);
    
    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting comment',
      error: error.message
    });
  }
};

module.exports = {
  getAllComments,
  createComment,
  markAsRead,
  getNewCommentsCount,
  deleteComment
};
