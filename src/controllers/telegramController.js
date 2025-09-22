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

// Channel configuration
const REQUIRED_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '@your_channel_username';
const CHANNEL_INVITE_LINK = process.env.TELEGRAM_CHANNEL_LINK || 'https://t.me/+xxxxxxxxxxxxx';

// Admin user IDs who can use admin commands
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())) : [];

const checkChannelMembership = async (userId) => {
  try {
    const chatMember = await bot.getChatMember(REQUIRED_CHANNEL_ID, userId);
    const validStatuses = ['member', 'administrator', 'creator'];
    return validStatuses.includes(chatMember.status);
  } catch (error) {
    console.error('Error checking channel membership:', error);
    return false;
  }
};

const isAdmin = (userId) => {
  return ADMIN_USER_IDS.includes(userId);
};

const getChannelSubscribersList = async () => {
  try {
    // Get channel information
    const chat = await bot.getChat(REQUIRED_CHANNEL_ID);
    const memberCount = chat.members_count || 0;

    // Note: Telegram Bot API doesn't provide a direct method to get all channel members
    // We can only get administrators and check individual users
    // This function will get administrators and recently active members from our database

    const administrators = await bot.getChatAdministrators(REQUIRED_CHANNEL_ID);
    
    // Get users from our database who have interacted with the bot
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const botUsers = [];
    
    querySnapshot.forEach((doc) => {
      const userData = doc.data();
      botUsers.push({
        id: doc.id,
        telegram_id: userData.telegram_id,
        username: userData.username,
        first_name: userData.first_name,
        last_name: userData.last_name,
        last_interaction: userData.last_interaction,
        is_subscribed: userData.is_subscribed
      });
    });

    // Check which bot users are still channel members
    const channelMembers = [];
    for (const user of botUsers) {
      try {
        const isStillMember = await checkChannelMembership(parseInt(user.telegram_id));
        if (isStillMember) {
          channelMembers.push({
            ...user,
            is_channel_member: true
          });
        }
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Error checking membership for user ${user.telegram_id}:`, error);
      }
    }

    return {
      channel_info: {
        id: chat.id,
        title: chat.title,
        username: chat.username,
        type: chat.type,
        description: chat.description,
        total_members: memberCount
      },
      administrators: administrators.map(admin => ({
        user_id: admin.user.id,
        username: admin.user.username,
        first_name: admin.user.first_name,
        last_name: admin.user.last_name,
        status: admin.status,
        is_bot: admin.user.is_bot
      })),
      bot_users_in_channel: channelMembers,
      summary: {
        total_channel_members: memberCount,
        administrators_count: administrators.length,
        bot_users_in_channel_count: channelMembers.length,
        total_bot_users: botUsers.length
      }
    };
  } catch (error) {
    console.error('Error getting channel subscribers list:', error);
    throw error;
  }
};

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

    // Add the new command handler for getting channel subscribers list
    bot.onText(/\/getchannelsubscriberlist/, async (msg) => {
      const chatId = msg.chat.id;
      const user = msg.from;
      
      console.log(`/getchannelsubscriberlist command from user: ${user.username || user.first_name} (${user.id})`);
      
      // Check if user is admin
      if (!isAdmin(user.id)) {
        const notAdminMessage = `🚫 <b>Access Denied</b>

This command is only available for administrators.

If you believe this is an error, please contact the bot administrator.`;

        try {
          await bot.sendMessage(chatId, notAdminMessage, {
            parse_mode: 'HTML'
          });
        } catch (error) {
          console.error('Error sending not admin message:', error);
        }
        return;
      }

      // Send loading message
      const loadingMessage = await bot.sendMessage(chatId, '⏳ <b>Fetching channel subscribers list...</b>\n\nThis may take a few moments...', {
        parse_mode: 'HTML'
      });

      try {
        const subscribersData = await getChannelSubscribersList();
        
        // Format the response message
        let responseMessage = `📊 <b>Channel Subscribers Report</b>\n\n`;
        
        // Channel Info
        responseMessage += `🏷️ <b>Channel Information:</b>\n`;
        responseMessage += `• Name: ${subscribersData.channel_info.title}\n`;
        responseMessage += `• Username: @${subscribersData.channel_info.username || 'N/A'}\n`;
        responseMessage += `• Type: ${subscribersData.channel_info.type}\n`;
        responseMessage += `• Total Members: ${subscribersData.summary.total_channel_members}\n\n`;

        // Summary
        responseMessage += `📈 <b>Summary:</b>\n`;
        responseMessage += `• Total Channel Members: ${subscribersData.summary.total_channel_members}\n`;
        responseMessage += `• Administrators: ${subscribersData.summary.administrators_count}\n`;
        responseMessage += `• Bot Users in Channel: ${subscribersData.summary.bot_users_in_channel_count}\n`;
        responseMessage += `• Total Bot Users: ${subscribersData.summary.total_bot_users}\n\n`;

        // Administrators
        responseMessage += `👑 <b>Administrators (${subscribersData.administrators.length}):</b>\n`;
        subscribersData.administrators.forEach((admin, index) => {
          const name = admin.first_name + (admin.last_name ? ` ${admin.last_name}` : '');
          const username = admin.username ? `@${admin.username}` : 'No username';
          responseMessage += `${index + 1}. ${name} (${username}) - ${admin.status}\n`;
        });

        // Check if message is too long for Telegram (max 4096 characters)
        if (responseMessage.length > 4000) {
          // Send basic info first
          let basicInfo = `📊 <b>Channel Subscribers Report</b>\n\n`;
          basicInfo += `🏷️ <b>Channel:</b> ${subscribersData.channel_info.title}\n`;
          basicInfo += `📈 <b>Summary:</b>\n`;
          basicInfo += `• Total Members: ${subscribersData.summary.total_channel_members}\n`;
          basicInfo += `• Administrators: ${subscribersData.summary.administrators_count}\n`;
          basicInfo += `• Bot Users in Channel: ${subscribersData.summary.bot_users_in_channel_count}\n`;
          basicInfo += `• Total Bot Users: ${subscribersData.summary.total_bot_users}\n\n`;
          basicInfo += `📄 <b>Detailed report will be sent as a file...</b>`;

          await bot.editMessageText(basicInfo, {
            chat_id: chatId,
            message_id: loadingMessage.message_id,
            parse_mode: 'HTML'
          });

          // Create detailed report as JSON file
          const detailedReport = {
            generated_at: new Date().toISOString(),
            channel_info: subscribersData.channel_info,
            summary: subscribersData.summary,
            administrators: subscribersData.administrators,
            bot_users_in_channel: subscribersData.bot_users_in_channel
          };

          // Send as document
          await bot.sendDocument(chatId, Buffer.from(JSON.stringify(detailedReport, null, 2)), {
            filename: `channel_subscribers_${new Date().toISOString().split('T')[0]}.json`,
            caption: '📄 Detailed Channel Subscribers Report (JSON format)'
          });

        } else {
          // Message is short enough, send normally
          await bot.editMessageText(responseMessage, {
            chat_id: chatId,
            message_id: loadingMessage.message_id,
            parse_mode: 'HTML'
          });
        }

        // Also send bot users list if there are any
        if (subscribersData.bot_users_in_channel.length > 0) {
          let botUsersMessage = `🤖 <b>Bot Users in Channel (${subscribersData.bot_users_in_channel.length}):</b>\n\n`;
          
          subscribersData.bot_users_in_channel.forEach((user, index) => {
            const name = user.first_name + (user.last_name ? ` ${user.last_name}` : '');
            const username = user.username ? `@${user.username}` : 'No username';
            const lastSeen = new Date(user.last_interaction).toLocaleDateString();
            botUsersMessage += `${index + 1}. ${name} (${username})\n   Last seen: ${lastSeen}\n\n`;
          });

          if (botUsersMessage.length > 4000) {
            // Send as file if too long
            await bot.sendDocument(chatId, Buffer.from(botUsersMessage), {
              filename: `bot_users_in_channel_${new Date().toISOString().split('T')[0]}.txt`,
              caption: '🤖 Bot Users in Channel (Text format)'
            });
          } else {
            await bot.sendMessage(chatId, botUsersMessage, {
              parse_mode: 'HTML'
            });
          }
        }

      } catch (error) {
        console.error('Error getting subscribers list:', error);
        
        const errorMessage = `❌ <b>Error</b>\n\nFailed to fetch channel subscribers list.\n\n<b>Error:</b> ${error.message}\n\n<b>Possible reasons:</b>\n• Bot doesn't have admin rights in the channel\n• Channel ID is incorrect\n• Network or API issues`;
        
        await bot.editMessageText(errorMessage, {
          chat_id: chatId,
          message_id: loadingMessage.message_id,
          parse_mode: 'HTML'
        });
      }
    });

    // Your existing command handlers...
    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const user = msg.from;
      
      console.log(`/start command from user: ${user.username || user.first_name} (${user.id})`);
      
      // Check if user is a member of the required channel
      const isChannelMember = await checkChannelMembership(user.id);
      
      if (!isChannelMember) {
        // User is not a member of the channel
        const notMemberMessage = `🚫 <b>Access Restricted</b>

To use this bot and access our premium domain marketplace, you must first join our official channel.

<b>Why join our channel?</b>
🔔 Get notified about new domain listings
💎 Access to exclusive deals
📈 Market insights and tips
🎯 Priority support

Please join our channel first, then come back and use /start again.`;

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: '📢 Join Our Channel',
                url: CHANNEL_INVITE_LINK
              }
            ],
            [
              {
                text: '🔄 I Joined - Check Again',
                callback_data: 'check_membership'
              }
            ]
          ]
        };

        try {
          await bot.sendMessage(chatId, notMemberMessage, {
            reply_markup: keyboard,
            parse_mode: 'HTML'
          });
        } catch (error) {
          console.error('Error sending not member message:', error);
        }
        return;
      }

      // User is a channel member, proceed with normal flow
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

    // Add admin help command
    bot.onText(/\/adminhelp/, async (msg) => {
      const chatId = msg.chat.id;
      const user = msg.from;
      
      if (!isAdmin(user.id)) {
        await bot.sendMessage(chatId, '🚫 This command is only available for administrators.');
        return;
      }

      const adminHelpMessage = `👑 <b>Admin Commands</b>

<b>Available Commands:</b>
/getchannelsubscriberlist - Get detailed channel subscribers report
/adminhelp - Show this admin help message

<b>Channel Subscriber List Features:</b>
• Total channel member count
• List of administrators
• Bot users who are channel members
• Detailed report export (JSON/Text)
• Last interaction timestamps

<b>Note:</b> Due to Telegram API limitations, only users who have interacted with the bot can be individually verified for channel membership.`;

      try {
        await bot.sendMessage(chatId, adminHelpMessage, {
          parse_mode: 'HTML'
        });
      } catch (error) {
        console.error('Error sending admin help message:', error);
      }
    });

    // Rest of your existing bot handlers...
    // (Include all your existing handlers like /help, callback_query, etc.)

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

// Rest of your existing functions...
const sendNotificationToAllUsers = async (message) => {
  // Your existing implementation
};

const getAllTelegramUsers = async (req, res) => {
  // Your existing implementation
};

const getUserByTelegramId = async (req, res) => {
  // Your existing implementation
};

const sendNotification = async (req, res) => {
  // Your existing implementation
};

module.exports = {
  initializeTelegramBot,
  getAllTelegramUsers,
  getUserByTelegramId,
  saveUserInfo,
  sendNotification,
  getChannelSubscribersList // Export the new function
};
