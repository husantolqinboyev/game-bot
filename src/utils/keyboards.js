const { Markup } = require('telegraf');

// =====================================================
// ADMIN KEYBOARDS
// =====================================================
const adminMainMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🏘 Guruhlar', 'admin:groups'), Markup.button.callback('🎮 O\'yinlar', 'admin:games')],
    [Markup.button.callback('➕ Yangi o\'yin', 'admin:create_game')],
    [Markup.button.callback('📢 Xabarnoma', 'admin:broadcast'), Markup.button.callback('📊 Statistika', 'admin:stats')],
    [Markup.button.callback('👔 Moderatorlar', 'admin:moderators')],
  ]);

const adminGameMenu = (gameId) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📊 Statistika', `game:stats:${gameId}`)],
    [Markup.button.callback('📥 Yuklab olish (JSON)', `game:export:${gameId}`)],
    [Markup.button.callback('⚙️ Sozlamalar', `game:settings:${gameId}`), Markup.button.callback('📢 Xabar', `game:broadcast:${gameId}`)],
    [Markup.button.callback('⏹ Tugatish', `game:end:${gameId}`), Markup.button.callback('🔙 Orqaga', 'admin:games')],

  ]);

const adminBroadcastMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('👥 Foydalanuvchilarga', 'broadcast:users')],
    [Markup.button.callback('🏘 Guruhlarga', 'broadcast:groups')],
    [Markup.button.callback('🎮 O\'yin ishtirokchilariga', 'broadcast:game_participants')],
    [Markup.button.callback('📡 Hammaga', 'broadcast:all')],
    [Markup.button.callback('🔙 Orqaga', 'admin:main')],
  ]);

const confirmMenu = (action) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('✅ Ha, tasdiqlash', `confirm:${action}`), Markup.button.callback('❌ Bekor qilish', 'cancel')],
  ]);

// =====================================================
// MODERATOR KEYBOARDS
// =====================================================
const modMainMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🎮 O\'yinlarim', 'mod:games')],
    [Markup.button.callback('📊 Statistika', 'mod:stats'), Markup.button.callback('📢 Xabar yuborish', 'mod:broadcast')],
    [Markup.button.callback('👥 Ishtirokchilar', 'mod:participants')],
  ]);

const modGameMenu = (gameId) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📊 Statistika', `mod:stats:${gameId}`)],
    [Markup.button.callback('👥 Ishtirokchilar', `mod:participants:${gameId}`)],
    [Markup.button.callback('📥 Yuklab olish (JSON)', `mod:export:${gameId}`)],
    [Markup.button.callback('📢 Xabar yuborish', `mod:broadcast:${gameId}`)],
    [Markup.button.callback('🔙 Orqaga', 'mod:games')],

  ]);

// =====================================================
// USER KEYBOARDS
// =====================================================
const userMainMenu = (gameId) =>
  Markup.keyboard([
    ['📜 O\'yin shartlari'],
    ['🔢 Raqamlarim', '📊 Statistika'],
    ['🔄 Transfer', '🔗 Taklif linki'],
    ['🏆 TOP ishtirokchilar']
  ]).resize();

const userGameSelectMenu = (games) => {
  const buttons = games.map((g) => [
    Markup.button.callback(`🎮 ${g.title} (${g.groups?.title || 'Guruh'})`, `user:join_game:${g.id}`),
  ]);
  return Markup.inlineKeyboard(buttons);
};

const cancelMenu = () =>
  Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor qilish', 'cancel')]]);

const backMenu = (target) =>
  Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', target)]]);

const urlButton = (text, url) =>
  Markup.inlineKeyboard([[Markup.button.url(text, url)]]);

module.exports = {
  adminMainMenu,
  adminGameMenu,
  adminBroadcastMenu,
  confirmMenu,
  modMainMenu,
  modGameMenu,
  userMainMenu,
  userGameSelectMenu,
  cancelMenu,
  backMenu,
  urlButton,
};
