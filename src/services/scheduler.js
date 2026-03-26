const cron = require('node-cron');
const supabase = require('../database/supabase');
const gameService = require('../services/gameService');
const { msgs } = require('../utils/messages');

/**
 * Start scheduled tasks
 */
function startScheduler(bot) {
  // Check every 5 minutes for expired games
  cron.schedule('*/5 * * * *', async () => {
    try {
      await checkExpiredGames(bot);
    } catch (err) {
      console.error('[CRON] checkExpiredGames error:', err.message);
    }
  });

  console.log('[CRON] Scheduler started');
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
