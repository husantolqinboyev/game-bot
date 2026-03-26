const { Telegraf } = require('telegraf');
require('dotenv').config();

// Bot instance
const bot = new Telegraf(process.env.BOT_TOKEN);

// Keep-alive function
async function keepAlive() {
  try {
    console.log('🔄 [CRON] Bot keep-alive ping at:', new Date().toISOString());
    
    // Ping bot itself or make a simple API call
    const botInfo = await bot.telegram.getMe();
    console.log(`✅ [CRON] Bot is alive: @${botInfo.username}`);
    
    // Optional: Send ping to a monitoring group/chat
    if (process.env.MONITOR_CHAT_ID) {
      await bot.telegram.sendMessage(
        process.env.MONITOR_CHAT_ID,
        `🤖 Bot is alive - ${new Date().toLocaleString('uz-UZ')}`
      ).catch(() => {});
    }
    
  } catch (error) {
    console.error('❌ [CRON] Keep-alive failed:', error.message);
  }
}

// Export for Vercel/serverless
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  await keepAlive();
  
  res.status(200).json({ 
    status: 'success', 
    timestamp: new Date().toISOString(),
    message: 'Bot keep-alive ping sent'
  });
};

// For local testing
if (require.main === module) {
  keepAlive();
}
