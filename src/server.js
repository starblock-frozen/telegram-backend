const express = require('express');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const domainRoutes = require('./routes/domainRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const authRoutes = require('./routes/authRoutes');
const telegramRoutes = require('./routes/telegramRoutes');

// Initialize Telegram bot
const { initializeTelegramBot } = require('./controllers/telegramController');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// WebSocket server
const wss = new WebSocket.Server({ server });

// Store WebSocket connections
const wsConnections = new Map();

// WebSocket authentication middleware
const authenticateWS = (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  
  if (!token) {
    ws.close(1008, 'No token provided');
    return null;
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    return decoded;
  } catch (error) {
    ws.close(1008, 'Invalid token');
    return null;
  }
};

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const user = authenticateWS(ws, req);
  if (!user) return;
  
  console.log(`WebSocket client connected: ${user.username}`);
  
  // Store connection with user info
  wsConnections.set(ws, user);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    message: 'WebSocket connection established'
  }));
  
  ws.on('close', () => {
    console.log(`WebSocket client disconnected: ${user.username}`);
    wsConnections.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    wsConnections.delete(ws);
  });
});

// Function to broadcast to all connected clients
const broadcastToAll = (data) => {
  wsConnections.forEach((user, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  });
};

// Function to broadcast new ticket notifications
const broadcastNewTicket = (ticket) => {
  broadcastToAll({
    type: 'NEW_TICKET',
    ticket: ticket,
    timestamp: new Date().toISOString()
  });
};

// Make broadcast functions available globally
global.broadcastNewTicket = broadcastNewTicket;
global.broadcastToAll = broadcastToAll;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/telegram', telegramRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    message: 'Server is running!',
    websocket: {
      connections: wsConnections.size,
      status: 'active'
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
  }
  
  res.status(500).json({
    success: false,
    message: error.message || 'Internal server error'
  });
});

// Initialize Telegram bot after server setup
initializeTelegramBot();

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
  console.log('Telegram bot is initializing...');
});
