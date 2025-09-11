const { 
  collection, 
  addDoc, 
  getDocs, 
  query,
  where,
  updateDoc,
  doc
} = require('firebase/firestore');
const { db } = require('../config/firebase');
const { bot } = require('../config/telegram');

const COLLECTION_NAME = 'telegram_users';

let botInitialized = false;

const saveUserInfo = async (userInfo) => {
  try {
    const { id, username, first_name, last_name } = userInfo;
    
    const q = query(collection(db, COLLECTION_NAME), where("telegram_id", "==", id.toString()));
    const querySnapshot = await getDocs(q);
    
    const userData = {
      telegram_id: id.toString(),
      username: username || '',
      first_name: first_name || '',
      last_name: last_name || '',
      is_subscribed: true,
      last_interaction: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (querySnapshot.empty) {
      userData.createdAt = new Date().toISOString();
      await addDoc(collection(db, COLLECTION_NAME), userData);
      console.log(`New user saved: ${username || first_name} (${id})`);
    } else {
      const userDoc = querySnapshot.docs[0];
      const userRef = doc(db, COLLECTION_NAME, userDoc.id);
      await updateDoc(userRef, userData);
      console.log(`User updated: ${username || first_name} (${id})`);
    }
    
    return true;
  } catch (error) {
    console.error('Error saving user info:', error);
    return false;
  }
};

const initializeTelegramBot = () => {
  if (botInitialized) {
    console.log('Telegram bot already initialized');
    return;
  }

  try {
    console.log('Telegram bot initialized');
    botInitialized = true;

    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const user = msg.from;
      
      console.log(`/start command from user: ${user.username || user.first_name} (${user.id})`);
      
      await saveUserInfo(user);
      
      const welcomeMessage = `🎉 Welcome to Domain Store Bot!
      
Thank you for subscribing! You now have access to our premium domain marketplace.

✅ Browse available domains
✅ Check domain details and pricing  
✅ Submit purchase requests
✅ Track your orders

Click the button below to launch our web application and start exploring!`;

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '🚀 Launch Web App',
              web_app: { url: process.env.WEB_APP_URL || 'https://google.com' }
            }
          ],
          [
            {
              text: '📞 Contact Support',
              url: 'https://t.me/+XMEn5LldGD1jZjkx'
            }
          ]
        ]
      };

      try {
        await bot.sendMessage(chatId, welcomeMessage, {
          reply_markup: keyboard,
          parse_mode: 'HTML'
        });
      } catch (error) {
        console.error('Error sending start message:', error);
      }
    });

    bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      const user = msg.from;
      
      console.log(`/help command from user: ${user.username || user.first_name} (${user.id})`);
      
      await saveUserInfo(user);
      
      const helpMessage = `🆘 <b>Domain Store Bot - Help</b>

<b>Available Commands:</b>
/start - Subscribe and launch the web app
/help - Show this help message

<b>How to use:</b>
1️⃣ Use /start to subscribe and get access
2️⃣ Click "Launch Web App" to browse domains
3️⃣ Browse available domains in our marketplace
4️⃣ Submit purchase requests directly through the app
5️⃣ Track your orders and tickets

<b>Features:</b>
🔍 Search domains by category, country, DA/PA
💰 View pricing and domain metrics
📝 Submit purchase requests
📊 Track order status
🔒 Secure authentication

<b>Need Support?</b>
Contact our support team for any assistance with your domain purchases or technical issues.

<b>Ready to start?</b> Use /start command to begin!`;

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '🚀 Launch Web App',
              web_app: { url: process.env.WEB_APP_URL || 'https://your-web-app-url.com' }
            }
          ],
          [
            {
              text: '🔄 Start Over',
              callback_data: 'start_over'
            },
            {
              text: '📞 Support',
              url: 'https://t.me/your_support_username'
            }
          ]
        ]
      };

      try {
        await bot.sendMessage(chatId, helpMessage, {
          reply_markup: keyboard,
          parse_mode: 'HTML'
        });
      } catch (error) {
        console.error('Error sending help message:', error);
      }
    });

    bot.on('callback_query', async (callbackQuery) => {
      const message = callbackQuery.message;
      const data = callbackQuery.data;
      const chatId = message.chat.id;
      const user = callbackQuery.from;

      if (data === 'start_over') {
        await saveUserInfo(user);
        
        const welcomeMessage = `🎉 Welcome back to Domain Store Bot!

You're already subscribed! Click the button below to launch our web application.`;

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: '🚀 Launch Web App',
                web_app: { url: process.env.WEB_APP_URL || 'https://your-web-app-url.com' }
              }
            ]
          ]
        };

        try {
          await bot.editMessageText(welcomeMessage, {
            chat_id: chatId,
            message_id: message.message_id,
            reply_markup: keyboard,
            parse_mode: 'HTML'
          });
        } catch (error) {
          console.error('Error editing message:', error);
        }
      }

      bot.answerCallbackQuery(callbackQuery.id);
    });

    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      const user = msg.from;

      if (text && (text.startsWith('/start') || text.startsWith('/help'))) {
        return;
      }

      if (text && !text.startsWith('/')) {
        console.log(`Message from user: ${user.username || user.first_name} (${user.id}): ${text}`);
        
        const responseMessage = `Hello ${user.first_name}! 👋

I understand you're trying to communicate, but I'm designed to help you access our domain marketplace.

Use these commands:
• /start - Subscribe and launch the web app
• /help - Get detailed help information

Ready to explore domains? Click the button below!`;

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: '🚀 Launch Web App',
                web_app: { url: process.env.WEB_APP_URL || 'https://your-web-app-url.com' }
              }
            ],
            [
              {
                text: '🆘 Help',
                callback_data: 'help'
              }
            ]
          ]
        };

        try {
          await bot.sendMessage(chatId, responseMessage, {
            reply_markup: keyboard,
            parse_mode: 'HTML'
          });
        } catch (error) {
          console.error('Error sending response message:', error);
        }
      }
    });

    bot.on('error', (error) => {
      console.error('Telegram bot error:', error);
    });

    bot.on('polling_error', (error) => {
      console.error('Telegram bot polling error:', error);
    });

  } catch (error) {
    console.error('Error initializing Telegram bot:', error);
    botInitialized = false;
  }
};

const sendNotificationToAllUsers = async (message) => {
  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const users = [];
    
    querySnapshot.forEach((doc) => {
      const userData = doc.data();
      if (userData.is_subscribed && userData.telegram_id) {
        users.push(userData);
      }
    });

    const results = {
      total: users.length,
      sent: 0,
      failed: 0,
      errors: []
    };

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🚀 Launch Web App',
            web_app: { url: process.env.WEB_APP_URL || 'https://google.com' }
          }
        ]
      ]
    };

    for (const user of users) {
      try {
        await bot.sendMessage(user.telegram_id, message, {
          reply_markup: keyboard,
          parse_mode: 'HTML'
        });
        results.sent++;
        
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error sending message to user ${user.telegram_id}:`, error);
        results.failed++;
        results.errors.push({
          telegram_id: user.telegram_id,
          username: user.username,
          error: error.message
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error sending notification to all users:', error);
    throw error;
  }
};

const getAllTelegramUsers = async (req, res) => {
  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const users = [];
    
    querySnapshot.forEach((doc) => {
      users.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.status(200).json({
      success: true,
      data: users,
      total: users.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching telegram users',
      error: error.message
    });
  }
};

const getUserByTelegramId = async (req, res) => {
  try {
    const { telegram_id } = req.params;
    
    const q = query(collection(db, COLLECTION_NAME), where("telegram_id", "==", telegram_id));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userDoc = querySnapshot.docs[0];
    res.status(200).json({
      success: true,
      data: {
        id: userDoc.id,
        ...userDoc.data()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
};

const sendNotification = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const results = await sendNotificationToAllUsers(message);

    res.status(200).json({
      success: true,
      message: 'Notification sent successfully',
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error sending notification',
      error: error.message
    });
  }
};

module.exports = {
  initializeTelegramBot,
  getAllTelegramUsers,
  getUserByTelegramId,
  saveUserInfo,
  sendNotification
};
