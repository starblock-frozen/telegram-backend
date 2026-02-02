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
const JOIN_REQUESTS_COLLECTION = 'join_requests';

let botInitialized = false;

// Channel configuration
const REQUIRED_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '@your_channel_username'; // e.g., '@domainstore' or '-1001234567890'
const CHANNEL_INVITE_LINK = process.env.TELEGRAM_CHANNEL_LINK || 'https://t.me/+xxxxxxxxxxxxx';

// Admin user IDs who can use admin commands
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())) : [];

const checkChannelMembership = async (userId) => {
  try {
    const chatMember = await bot.getChatMember(REQUIRED_CHANNEL_ID, userId);
    
    // Check if user is a member (member, administrator, creator)
    // Exclude 'left' and 'kicked' statuses
    const validStatuses = ['member', 'administrator', 'creator'];
    return validStatuses.includes(chatMember.status);
  } catch (error) {
    console.error('Error checking channel membership:', error);
    // If there's an error (like user privacy settings), assume they're not a member
    return false;
  }
};

const isAdmin = (userId) => {
  return ADMIN_USER_IDS.includes(userId);
};

const saveJoinRequest = async (userInfo) => {
  try {
    const { id, username, first_name, last_name } = userInfo;
    
    // Check if join request already exists
    const q = query(collection(db, JOIN_REQUESTS_COLLECTION), where("telegram_id", "==", id.toString()));
    const querySnapshot = await getDocs(q);
    
    const requestData = {
      telegram_id: id.toString(),
      username: username || '',
      first_name: first_name || '',
      last_name: last_name || '',
      status: 'pending', // pending, approved, rejected
      request_time: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (querySnapshot.empty) {
      requestData.createdAt = new Date().toISOString();
      await addDoc(collection(db, JOIN_REQUESTS_COLLECTION), requestData);
      console.log(`Join request saved: ${username || first_name} (${id})`);
    } else {
      const requestDoc = querySnapshot.docs[0];
      const requestRef = doc(db, JOIN_REQUESTS_COLLECTION, requestDoc.id);
      await updateDoc(requestRef, requestData);
      console.log(`Join request updated: ${username || first_name} (${id})`);
    }
    
    return true;
  } catch (error) {
    console.error('Error saving join request:', error);
    return false;
  }
};

const getChannelSubscribersList = async () => {
  try {
    // Get channel info first
    const chat = await bot.getChat(REQUIRED_CHANNEL_ID);
    const memberCount = chat.members_count || 0;
    
    console.log(`Channel: ${chat.title}, Members: ${memberCount}`);
    
    // Note: Telegram Bot API doesn't provide a direct way to get all channel members
    // We can only get administrators and check individual users
    
    // Get administrators
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
        is_subscribed: userData.is_subscribed,
        last_interaction: userData.last_interaction,
        createdAt: userData.createdAt
      });
    });

    // Check which bot users are channel members
    const channelMembers = [];
    const nonMembers = [];
    
    for (const user of botUsers) {
      try {
        const isMember = await checkChannelMembership(parseInt(user.telegram_id));
        if (isMember) {
          channelMembers.push(user);
        } else {
          nonMembers.push(user);
        }
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error checking membership for user ${user.telegram_id}:`, error);
        nonMembers.push(user);
      }
    }

    return {
      channelInfo: {
        id: chat.id,
        title: chat.title,
        username: chat.username,
        type: chat.type,
        totalMembers: memberCount,
        description: chat.description
      },
      administrators: administrators.map(admin => ({
        user_id: admin.user.id,
        username: admin.user.username,
        first_name: admin.user.first_name,
        last_name: admin.user.last_name,
        status: admin.status,
        is_bot: admin.user.is_bot
      })),
      botInteractedUsers: {
        total: botUsers.length,
        channelMembers: channelMembers.length,
        nonMembers: nonMembers.length,
        members: channelMembers,
        nonMembersList: nonMembers
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

const formatSubscribersList = (data) => {
  const { channelInfo, administrators, botInteractedUsers } = data;
  
  let message = `📊 <b>Channel Subscribers Report</b>\n\n`;
  
  // Channel Info
  message += `🏷️ <b>Channel Information:</b>\n`;
  message += `• Name: ${channelInfo.title}\n`;
  message += `• Username: @${channelInfo.username || 'N/A'}\n`;
  message += `• Total Members: ${channelInfo.totalMembers}\n`;
  message += `• Type: ${channelInfo.type}\n\n`;
  
  // Administrators
  message += `👑 <b>Administrators (${administrators.length}):</b>\n`;
  administrators.forEach((admin, index) => {
    const name = admin.first_name + (admin.last_name ? ` ${admin.last_name}` : '');
    const username = admin.username ? `@${admin.username}` : 'No username';
    message += `${index + 1}. ${name} (${username}) - ${admin.status}\n`;
  });
  
  message += `\n📱 <b>Bot Users Analysis:</b>\n`;
  message += `• Total bot users: ${botInteractedUsers.total}\n`;
  message += `• Channel members: ${botInteractedUsers.channelMembers}\n`;
  message += `• Non-members: ${botInteractedUsers.nonMembers}\n\n`;
  
  // Channel Members from bot users
  if (botInteractedUsers.members.length > 0) {
    message += `✅ <b>Bot Users who are Channel Members (${botInteractedUsers.members.length}):</b>\n`;
    botInteractedUsers.members.slice(0, 20).forEach((member, index) => {
      const name = member.first_name + (member.last_name ? ` ${member.last_name}` : '');
      const username = member.username ? `@${member.username}` : 'No username';
      message += `${index + 1}. ${name} (${username})\n`;
    });
    
    if (botInteractedUsers.members.length > 20) {
      message += `... and ${botInteractedUsers.members.length - 20} more\n`;
    }
  }
  
  message += `\n📝 <i>Note: This list shows only users who have interacted with the bot. Telegram doesn't allow bots to get the complete member list of channels.</i>`;
  
  return message;
};

const initializeTelegramBot = () => {
  if (botInitialized) {
    console.log('Telegram bot already initialized');
    return;
  }

  try {
    console.log('Telegram bot initialized');
    botInitialized = true;

    // Handle chat join requests
    bot.on('chat_join_request', async (chatJoinRequest) => {
      const { chat, from, date } = chatJoinRequest;
      
      console.log(`Join request from user: ${from.username || from.first_name} (${from.id}) for chat: ${chat.title}`);
      
      // Save join request to database
      await saveJoinRequest(from);
      
      // Notify user that their request is pending
      const pendingMessage = `⏳ <b>Join Request Submitted</b>

Your request to join our channel has been submitted and is pending approval.

<b>What happens next?</b>
• Our admins will review your request
• You'll be notified once approved or rejected
• If approved, you'll get access to our premium domain marketplace

<b>Please wait for admin approval...</b>

Thank you for your patience! 🙏`;

      try {
        await bot.sendMessage(from.id, pendingMessage, {
          parse_mode: 'HTML'
        });
      } catch (error) {
        console.error('Error sending pending message:', error);
      }
    });

    // Handle when user joins the channel (approved)
    bot.on('chat_member', async (chatMemberUpdate) => {
      const { chat, new_chat_member, old_chat_member, from } = chatMemberUpdate;
      
      // Check if this is our target channel
      if (chat.id.toString() !== REQUIRED_CHANNEL_ID.replace('@', '').replace('-', '')) {
        return;
      }
      
      // Check if user status changed from restricted/left to member
      const oldStatus = old_chat_member?.status;
      const newStatus = new_chat_member?.status;
      const userId = new_chat_member?.user?.id;
      
      if (userId && oldStatus !== 'member' && newStatus === 'member') {
        console.log(`User ${userId} was approved to join the channel`);
        
        // Update join request status
        try {
          const q = query(collection(db, JOIN_REQUESTS_COLLECTION), where("telegram_id", "==", userId.toString()));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const requestDoc = querySnapshot.docs[0];
            const requestRef = doc(db, JOIN_REQUESTS_COLLECTION, requestDoc.id);
            await updateDoc(requestRef, {
              status: 'approved',
              approved_time: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error('Error updating join request status:', error);
        }
        
        // Send approval notification
        const approvalMessage = `🎉 <b>Welcome! Your Join Request Approved</b>

Congratulations! You have been approved to join our premium domain marketplace channel.

<b>You now have access to:</b>
✅ Browse available domains
✅ Check domain details and pricing  
✅ Submit purchase requests
✅ Track your orders
✅ Get exclusive deals and notifications

<b>Ready to start?</b>
Click the button below to launch our web application and start exploring premium domains!

Welcome to our community! 🚀`;

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
                url: 'https://t.me/bitterSweet4me'
              }
            ]
          ]
        };

        try {
          await bot.sendMessage(userId, approvalMessage, {
            reply_markup: keyboard,
            parse_mode: 'HTML'
          });
          
          // Also save user info as they are now a member
          await saveUserInfo(new_chat_member.user);
        } catch (error) {
          console.error('Error sending approval message:', error);
        }
      }
      
      // Handle rejection (user removed from channel)
      if (userId && (oldStatus === 'member' || oldStatus === 'restricted') && (newStatus === 'kicked' || newStatus === 'left')) {
        console.log(`User ${userId} was removed/left the channel`);
        
        // Update join request status
        try {
          const q = query(collection(db, JOIN_REQUESTS_COLLECTION), where("telegram_id", "==", userId.toString()));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const requestDoc = querySnapshot.docs[0];
            const requestRef = doc(db, JOIN_REQUESTS_COLLECTION, requestDoc.id);
            await updateDoc(requestRef, {
              status: 'rejected',
              rejected_time: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error('Error updating join request status:', error);
        }
        
        // Send rejection notification only if it was a kick (not voluntary leave)
        if (newStatus === 'kicked') {
          const rejectionMessage = `❌ <b>Join Request Rejected</b>

Unfortunately, your request to join our channel has been rejected by the administrators.

<b>Possible reasons:</b>
• Channel capacity limits
• Administrative review requirements
• Channel policies

You can try submitting a new request later or contact our support team for more information.

Thank you for your understanding.`;

          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: '📞 Contact Support',
                  url: 'https://t.me/bitterSweet4me'
                }
              ]
            ]
          };

          try {
            await bot.sendMessage(userId, rejectionMessage, {
              reply_markup: keyboard,
              parse_mode: 'HTML'
            });
          } catch (error) {
            console.error('Error sending rejection message:', error);
          }
        }
      }
    });

    // Admin command to get channel subscribers list
    bot.onText(/\/getchannelsubscriberlist/, async (msg) => {
      const chatId = msg.chat.id;
      const user = msg.from;
      
      console.log(`/getchannelsubscriberlist command from user: ${user.username || user.first_name} (${user.id})`);
      
      // Check if user is admin
      if (!isAdmin(user.id)) {
        const unauthorizedMessage = `🚫 <b>Unauthorized Access</b>

This command is only available for administrators.

If you believe this is an error, please contact the system administrator.`;

        try {
          await bot.sendMessage(chatId, unauthorizedMessage, {
            parse_mode: 'HTML'
          });
        } catch (error) {
          console.error('Error sending unauthorized message:', error);
        }
        return;
      }

      // Send processing message
      const processingMessage = await bot.sendMessage(chatId, '⏳ Processing... This may take a few moments.', {
        parse_mode: 'HTML'
      });

      try {
        const subscribersData = await getChannelSubscribersList();
        const formattedMessage = formatSubscribersList(subscribersData);
        
        // Delete processing message
        await bot.deleteMessage(chatId, processingMessage.message_id);
        
        // Send the subscribers list (split if too long)
        if (formattedMessage.length <= 4096) {
          await bot.sendMessage(chatId, formattedMessage, {
            parse_mode: 'HTML'
          });
        } else {
          // Split message if too long
          const chunks = [];
          let currentChunk = '';
          const lines = formattedMessage.split('\n');
          
          for (const line of lines) {
            if ((currentChunk + line + '\n').length <= 4096) {
              currentChunk += line + '\n';
            } else {
              if (currentChunk) chunks.push(currentChunk);
              currentChunk = line + '\n';
            }
          }
          if (currentChunk) chunks.push(currentChunk);
          
          for (let i = 0; i < chunks.length; i++) {
            await bot.sendMessage(chatId, chunks[i], {
              parse_mode: 'HTML'
            });
            // Add delay between messages
            if (i < chunks.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
        
        // Send detailed data as a file if there are many users
        if (subscribersData.botInteractedUsers.total > 50) {
          const detailedData = JSON.stringify(subscribersData, null, 2);
          await bot.sendDocument(chatId, Buffer.from(detailedData), {
            filename: `channel_subscribers_${new Date().toISOString().split('T')[0]}.json`,
            caption: '📄 Detailed subscribers data (JSON format)'
          });
        }
        
      } catch (error) {
        console.error('Error getting subscribers list:', error);
        
        // Delete processing message
        try {
          await bot.deleteMessage(chatId, processingMessage.message_id);
        } catch (deleteError) {
          console.error('Error deleting processing message:', deleteError);
        }
        
        const errorMessage = `❌ <b>Error Getting Subscribers List</b>

There was an error retrieving the channel subscribers list:
<code>${error.message}</code>

Please try again later or contact the system administrator.`;

        await bot.sendMessage(chatId, errorMessage, {
          parse_mode: 'HTML'
        });
      }
    });

    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const user = msg.from;
      
      console.log(`/start command from user: ${user.username || user.first_name} (${user.id})`);
      
      // Check if user is a member of the required channel
      const isChannelMember = await checkChannelMembership(user.id);
      
      if (!isChannelMember) {
        // User is not a member of the channel
        const notMemberMessage = `🔐 <b>Channel Membership Required</b>

To access our premium domain marketplace, you need to be a member of our official channel.

<b>Why join our channel?</b>
🔔 Get notified about new domain listings
💎 Access to exclusive deals and premium domains
📈 Market insights and domain investment tips
🎯 Priority customer support
🚀 Access to our web application

<b>How it works:</b>
1. Click "Request to Join Channel" below
2. Wait for admin approval
3. Once approved, you'll be notified automatically
4. Return here and use /start to access the web app

<i>Note: Join requests are reviewed by our administrators. You'll be notified once your request is processed.</i>`;

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: '📢 Request to Join Channel',
                url: CHANNEL_INVITE_LINK
              }
            ],
            [
              {
                text: '🔄 I\'m Already a Member',
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
      
      const welcomeMessage = `🎉 <b>Welcome to Domain Store Bot!</b>
      
Thank you for being a member of our channel! You now have full access to our premium domain marketplace.

<b>What you can do:</b>
✅ Browse thousands of available domains
✅ Check detailed domain metrics (DA, PA, SS, Backlinks)
✅ View pricing and domain categories
✅ Submit purchase requests instantly
✅ Track your order status
✅ Get exclusive member deals

<b>Ready to explore premium domains?</b>
Click the button below to launch our web application and start your domain investment journey!`;

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
              url: 'https://t.me/bitterSweet4me'
            },
            {
              text: '💬 Join Channel',
              url: CHANNEL_INVITE_LINK
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
      
      // Check channel membership for help command too
      const isChannelMember = await checkChannelMembership(user.id);
      
      if (!isChannelMember) {
        const notMemberMessage = `🚫 <b>Access Restricted</b>

You need to be a member of our channel to access help and other features.

Please request to join our channel first and wait for approval:`;

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: '📢 Request to Join Channel',
                url: CHANNEL_INVITE_LINK
              }
            ],
            [
              {
                text: '🔄 I\'m Already a Member',
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
      
      await saveUserInfo(user);
      
      let helpMessage = `🆘 <b>Domain Store Bot - Help Guide</b>

<b>Available Commands:</b>
/start - Access the domain marketplace
/help - Show this comprehensive help guide`;

      // Add admin commands if user is admin
      if (isAdmin(user.id)) {
        helpMessage += `

<b>Admin Commands:</b>
/getchannelsubscriberlist - Get detailed channel subscribers report`;
      }

      helpMessage += `

<b>How to Use the Bot:</b>
1️⃣ Use /start to access the web application
2️⃣ Click "Launch Web App" to browse domains
3️⃣ Search and filter domains by your preferences
4️⃣ Submit purchase requests for domains you want
5️⃣ Track your orders and communicate with support

<b>Web App Features:</b>
🔍 <b>Search & Filter:</b> Find domains by category, country, DA/PA scores
💰 <b>Pricing Info:</b> View detailed pricing and domain metrics
📝 <b>Purchase Requests:</b> Submit requests directly through the app
📊 <b>Order Tracking:</b> Monitor your purchase status in real-time
🔒 <b>Secure Platform:</b> Safe and authenticated transactions

<b>Domain Metrics Explained:</b>
• <b>DA (Domain Authority):</b> Search engine ranking potential (0-100)
• <b>PA (Page Authority):</b> Individual page ranking potential (0-100)
• <b>SS (Spam Score):</b> Lower is better (0-17)
• <b>Backlinks:</b> Number of referring domains

<b>Need Assistance?</b>
Our support team is available to help with:
• Domain selection advice
• Purchase process guidance
• Technical issues
• Account management

<b>Ready to start your domain investment journey?</b>
Use /start to launch the web application!`;

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
              text: '🔄 Start Over',
              callback_data: 'start_over'
            },
            {
              text: '📞 Support',
              url: 'https://t.me/+XMEn5LldGD1jZjkx'
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

      if (data === 'check_membership') {
        // Re-check channel membership
        const isChannelMember = await checkChannelMembership(user.id);
        
        if (isChannelMember) {
          // User has joined the channel
          await saveUserInfo(user);
          
          const welcomeMessage = `🎉 <b>Welcome to Domain Store Bot!</b>

Perfect! You're now confirmed as a member of our channel. You have full access to our premium domain marketplace.

<b>What's available to you:</b>
✅ Browse thousands of premium domains
✅ Access detailed domain analytics
✅ Submit purchase requests instantly
✅ Track orders in real-time
✅ Get member-exclusive deals

<b>Ready to start?</b>
Click the button below to launch our web application and explore premium domains!`;

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
                  url: 'https://t.me/bitterSweet4me'
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
        } else {
          // User still hasn't joined or request is pending
          const stillNotMemberMessage = `⏳ <b>Membership Status Check</b>

We couldn't confirm your channel membership yet. This could mean:

<b>If you just requested to join:</b>
• Your join request is still pending admin approval
• Please wait for our administrators to review your request
• You'll be notified automatically once approved

<b>If you think you're already a member:</b>
• There might be a delay in updating membership status
• Try waiting a few minutes and check again
• Make sure you actually joined (not just visited) the channel

<b>Need to submit a join request?</b>
Click the button below to request channel access.`;

          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: '📢 Request to Join Channel',
                  url: CHANNEL_INVITE_LINK
                }
              ],
              [
                {
                  text: '🔄 Check Again',
                  callback_data: 'check_membership'
                }
              ]
            ]
          };

          try {
            await bot.editMessageText(stillNotMemberMessage, {
              chat_id: chatId,
              message_id: message.message_id,
              reply_markup: keyboard,
              parse_mode: 'HTML'
            });
          } catch (error) {
            console.error('Error editing message:', error);
          }
        }
      } else if (data === 'start_over') {
        // Check membership before allowing start over
        const isChannelMember = await checkChannelMembership(user.id);
        
        if (!isChannelMember) {
          const notMemberMessage = `🔐 <b>Channel Membership Required</b>

You need to be a member of our channel to access the bot features.

Please request to join our channel and wait for admin approval:`;
          
          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: '📢 Request to Join Channel',
                  url: CHANNEL_INVITE_LINK
                }
              ],
              [
                {
                  text: '🔄 I\'m Already a Member',
                  callback_data: 'check_membership'
                }
              ]
            ]
          };

          try {
            await bot.editMessageText(notMemberMessage, {
              chat_id: chatId,
              message_id: message.message_id,
              reply_markup: keyboard,
              parse_mode: 'HTML'
            });
          } catch (error) {
            console.error('Error editing message:', error);
          }
          return;
        }

        await saveUserInfo(user);
        
        const welcomeMessage = `🎉 <b>Welcome Back to Domain Store Bot!</b>

You're already a verified member! Ready to continue your domain investment journey?

Click the button below to launch our web application and explore premium domains.`;

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
                url: 'https://t.me/bitterSweet4me'
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

      // Skip if it's a command we already handle
      if (text && (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/getchannelsubscriberlist'))) {
        return;
      }

      // Handle regular messages
      if (text && !text.startsWith('/')) {
        console.log(`Message from user: ${user.username || user.first_name} (${user.id}): ${text}`);
        
        // Check channel membership for regular messages too
        const isChannelMember = await checkChannelMembership(user.id);
        
        if (!isChannelMember) {
          const notMemberMessage = `🔐 <b>Access Restricted</b>

You need to be a member of our channel to interact with the bot.

Please request to join our channel first and wait for admin approval. Once approved, you'll be notified automatically and can return to use the bot.`;

          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: '📢 Request to Join Channel',
                  url: CHANNEL_INVITE_LINK
                }
              ],
              [
                {
                  text: '🔄 I\'m Already a Member',
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

        // User is a member, provide helpful response
        const responseMessage = `Hello ${user.first_name}! 👋

I understand you're trying to communicate, but I'm designed to help you access our premium domain marketplace.

<b>Available Commands:</b>
• /start - Access the domain marketplace
• /help - Get detailed help and guidance

<b>Ready to explore domains?</b>
Click the button below to launch our web application and start browsing thousands of premium domains!`;

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
                text: '🆘 Help Guide',
                callback_data: 'help'
              },
              {
                text: '📞 Support',
                url: 'https://t.me/+XMEn5LldGD1jZjkx'
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

    // Handle unknown commands
    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      const user = msg.from;

      // Only handle commands that start with / but are not recognized
      if (text && text.startsWith('/') && 
          !text.startsWith('/start') && 
          !text.startsWith('/help') && 
          !text.startsWith('/getchannelsubscriberlist')) {
        
        console.log(`Unknown command from user: ${user.username || user.first_name} (${user.id}): ${text}`);
        
        // Check channel membership
        const isChannelMember = await checkChannelMembership(user.id);
        
        if (!isChannelMember) {
          const notMemberMessage = `🔐 <b>Access Restricted</b>

You need to be a member of our channel to use bot commands.

Please request to join our channel first:`;

          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: '📢 Request to Join Channel',
                  url: CHANNEL_INVITE_LINK
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

        const unknownCommandMessage = `❓ <b>Unknown Command</b>

Sorry, I don't recognize the command "${text}".

<b>Available Commands:</b>
• /start - Access the domain marketplace
• /help - Get detailed help and guidance`;

        if (isAdmin(user.id)) {
          unknownCommandMessage += `
• /getchannelsubscriberlist - Get channel subscribers report (Admin only)`;
        }

        unknownCommandMessage += `

<b>Need help?</b> Use /help for a complete guide or click the buttons below:`;

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
                text: '🆘 Help Guide',
                callback_data: 'help'
              },
              {
                text: '📞 Support',
                url: 'https://t.me/+XMEn5LldGD1jZjkx'
              }
            ]
          ]
        };

        try {
          await bot.sendMessage(chatId, unknownCommandMessage, {
            reply_markup: keyboard,
            parse_mode: 'HTML'
          });
        } catch (error) {
          console.error('Error sending unknown command message:', error);
        }
      }
    });

    // Error handling
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
        // Check if user is still a channel member before sending notification
        const isChannelMember = await checkChannelMembership(parseInt(user.telegram_id));
        
        if (isChannelMember) {
          await bot.sendMessage(user.telegram_id, message, {
            reply_markup: keyboard,
            parse_mode: 'HTML'
          });
          results.sent++;
        } else {
          results.failed++;
          results.errors.push({
            telegram_id: user.telegram_id,
            username: user.username,
            error: 'User is not a channel member'
          });
        }
        
        // Add delay to avoid rate limiting
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

// Get all join requests (admin function)
const getAllJoinRequests = async (req, res) => {
  try {
    const querySnapshot = await getDocs(collection(db, JOIN_REQUESTS_COLLECTION));
    const requests = [];
    
    querySnapshot.forEach((doc) => {
      requests.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.status(200).json({
      success: true,
      data: requests,
      total: requests.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching join requests',
      error: error.message
    });
  }
};

const deleteTelegramUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    await deleteDoc(doc(db, COLLECTION_NAME, id));
    
    res.status(200).json({
      success: true,
      message: 'Telegram user deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting telegram user',
      error: error.message
    });
  }
};

module.exports = {
  initializeTelegramBot,
  getAllTelegramUsers,
  getUserByTelegramId,
  saveUserInfo,
  sendNotification,
  getChannelSubscribersList,
  getAllJoinRequests,
  deleteTelegramUser
};
