require('dotenv').config();
const { Telegraf, Scenes, session } = require('telegraf');

// Services & Handlers
const { saveUser, attachRole, saveGroup } = require('./middlewares/auth');
const { handleAdminCommand, registerAdminCallbacks, createGameScene, handleAdminInput } = require('./handlers/admin');

const { handleModCommand, registerModCallbacks } = require('./handlers/moderator');
const {
  handleStart,
  transferScene,
  registerUserCallbacks,
} = require('./handlers/user');
const { registerGroupHandlers } = require('./handlers/group');
const { handleBroadcastMessage } = require('./handlers/broadcast');
const { startScheduler } = require('./services/scheduler');
const http = require('http');

// =====================================================
// BOT SETUP
// =====================================================
const bot = new Telegraf(process.env.BOT_TOKEN);

// Simple Health-check server for Render/Vercel
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK', uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT, () => {
  console.log(`🚀 Health-check server running on port ${PORT}`);
});

// Stage (scenes)
const stage = new Scenes.Stage([createGameScene, transferScene]);

// Global middlewares
bot.use(session());
bot.use(stage.middleware());
bot.use(saveUser);
bot.use(saveGroup);
bot.use(attachRole);

// =====================================================
// COMMANDS
// =====================================================
bot.start(handleStart);

bot.command('admin', handleAdminCommand);
bot.command(['mod', 'moderator'], handleModCommand);


bot.command('help', async (ctx) => {
  const isGroup = ['group', 'supergroup'].includes(ctx.chat?.type);

  if (isGroup) {
    await ctx.reply(
      `ℹ️ <b>Guruh buyruqlari:</b>\n\n` +
        `/top — TOP 10 ishtirokchi\n` +
        `/mystats — Mening statistikam\n` +
        `/gameinfo — O'yin haqida ma'lumot`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.reply(
      `ℹ️ <b>Bot buyruqlari:</b>\n\n` +
        `/start — Botni boshlash\n` +
        `/admin — Admin paneli\n` +
        `/mod — Moderator paneli\n\n` +
        `<i>O'yinga qo'shilish uchun guruhdan referral link oling.</i>`,
      { parse_mode: 'HTML' }
    );
  }
});

// =====================================================
// CALLBACK QUERIES
// =====================================================
registerAdminCallbacks(bot);
registerModCallbacks(bot);
registerUserCallbacks(bot);

// =====================================================
// GROUP EVENTS
// =====================================================
registerGroupHandlers(bot);

const { handleChatMemberUpdate } = require('./middlewares/antiCheat');
bot.on('chat_member', handleChatMemberUpdate);


// =====================================================
// MESSAGES (Broadcast handler)
// =====================================================
bot.on('message', async (ctx, next) => {
  // Skip group messages for broadcast
  if (['group', 'supergroup'].includes(ctx.chat?.type)) return next();

  // Handle admin inputs (edit settings)
  const editHandled = await handleAdminInput(ctx);
  if (editHandled) return;

  // Handle broadcast input
  const broadcastHandled = await handleBroadcastMessage(ctx, bot);
  if (broadcastHandled) return;

  return next();
});


// =====================================================
// ERROR HANDLING
// =====================================================
bot.catch((err, ctx) => {
  console.error(`[BOT ERROR] Update ${ctx.updateType}:`, err.message);
  if (ctx.chat?.type === 'private') {
    ctx.reply('⚠️ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.').catch(() => {});
  }
});

// =====================================================
// LAUNCH
// =====================================================
async function main() {
  console.log('🤖 Guruh Oyini Bot ishga tushmoqda...');

  // Start scheduler
  startScheduler(bot);

  // Launch bot
  await bot.launch({
    allowedUpdates: [
      'message',
      'callback_query',
      'my_chat_member',
      'chat_member',
    ],
  });

  console.log('✅ Bot muvaffaqiyatli ishga tushdi!');

  // Graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
