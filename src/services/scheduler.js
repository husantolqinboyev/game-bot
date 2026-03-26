const cron = require('node-cron');
const https = require('https');
const supabase = require('../database/supabase');
const gameService = require('../services/gameService');
const { msgs } = require('../utils/messages');

/**
 * Start scheduled tasks
 */
function startScheduler(bot) {
  // 1. Check every 5 minutes for expired games
  cron.schedule('*/5 * * * *', async () => {
    try {
      await checkExpiredGames(bot);
    } catch (err) {
      console.error('[CRON] checkExpiredGames error:', err.message);
    }
  });

  // 2. Keep-alive job (every 10 minutes)
  // Render's free tier sleeps at 15 mins of inactivity.
  cron.schedule('*/10 * * * *', async () => {
    try {
      await performKeepAlive();
    } catch (err) {
      console.error('[CRON] Keep-alive error:', err.message);
    }
  });

  console.log('[CRON] Scheduler started');
}

/**
 * Perform keep-alive pings (Supabase & Self)
 */
async function performKeepAlive() {
  console.log(`🔄 [CRON] Heartbeat at: ${new Date().toISOString()}`);

  // 1. Supabase heartbeat (actual update to keep DB project active)
  const { error } = await supabase
    .from('bot_heartbeat')
    .upsert({ id: 1, last_ping: new Date().toISOString(), status: 'active' })
    .eq('id', 1);

  if (error) console.error('❌ [CRON] Supabase heartbeat failed:', error.message);
  else console.log('✅ [CRON] Supabase heartbeat updated.');

  // 2. Self-ping to Render (if BOT_URL is provided in .env)
  const botUrl = process.env.BOT_URL;
  if (botUrl) {
    const url = botUrl.endsWith('/') ? botUrl : botUrl + '/';
    https.get(url, (res) => {
      console.log(`✅ [CRON] Self-ping successful: ${res.statusCode}`);
    }).on('error', (err) => {
      console.error('❌ [CRON] Self-ping failed:', err.message);
    });
  }
}

/**
 * Check and end expired games
 */
async function checkExpiredGames(bot) {
  const now = new Date().toISOString();

  const { data: expiredGames, error } = await supabase
    .from('games')
    .select('*, groups(*)')
    .eq('is_active', true)
    .not('end_date', 'is', null)
    .lt('end_date', now);

  if (error || !expiredGames?.length) return;

  for (const game of expiredGames) {
    console.log(`[CRON] Ending expired game: ${game.title} (${game.id})`);

    await gameService.endGame(game.id);

    // Game just ends silently or logs to console
    console.log(`[CRON] Game ${game.id} ended.`);

  }
}

module.exports = { startScheduler };
