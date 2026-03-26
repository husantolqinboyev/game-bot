const { Markup } = require('telegraf');
const gameService = require('../services/gameService');
const userService = require('../services/userService');
const { msgs } = require('../utils/messages');
const { modMainMenu, modGameMenu } = require('../utils/keyboards');

async function handleModCommand(ctx) {
  const games = await gameService.getModeratorGames(ctx.from.id);

  if (!games.length && !ctx.isAdmin) {
    return ctx.reply(
      `👔 <b>Moderator paneli</b>\n\nSiz hech qanday o'yinga moderator sifatida tayinlanmadingiz.`,
      { parse_mode: 'HTML' }
    );
  }

  await ctx.reply(msgs.modWelcome(ctx.from.first_name), {
    parse_mode: 'HTML',
    ...modMainMenu(),
  });
}

function registerModCallbacks(bot) {
  // Mod main menu (back button target)
  bot.action('mod:main', async (ctx) => {
    if (!ctx.isModerator && !ctx.isAdmin)
      return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    await ctx.answerCbQuery();
    try {
      await ctx.editMessageText(msgs.modWelcome(ctx.from.first_name), {
        parse_mode: 'HTML',
        ...modMainMenu(),
      });
    } catch {
      await ctx.reply(msgs.modWelcome(ctx.from.first_name), {
        parse_mode: 'HTML',
        ...modMainMenu(),
      });
    }
  });

  // Mod games list
  bot.action('mod:games', async (ctx) => {
    if (!ctx.isModerator && !ctx.isAdmin)
      return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    await ctx.answerCbQuery();

    const games = await gameService.getModeratorGames(ctx.from.id);

    if (!games.length) {
      return ctx.editMessageText('🎮 Biriktirilgan o\'yinlar topilmadi.', {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'mod:main')]]),
      });
    }

    const buttons = games.map((g) => [
      Markup.button.callback(`🎮 ${g.title}`, `mod:game:${g.id}`),
    ]);
    buttons.push([Markup.button.callback('🔙 Orqaga', 'mod:main')]);

    await ctx.editMessageText('🎮 <b>Mening o\'yinlarim:</b>', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
  });

  // Mod overall stats (across all assigned games)
  bot.action('mod:stats', async (ctx) => {
    if (!ctx.isModerator && !ctx.isAdmin)
      return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    await ctx.answerCbQuery();

    const games = await gameService.getModeratorGames(ctx.from.id);
    if (!games.length) {
      return ctx.editMessageText('📊 Hech qanday o\'yin topilmadi.', {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'mod:main')]]),
      });
    }

    let text = `📊 <b>Umumiy statistika</b>\n\n`;
    for (const g of games) {
      const stats = await gameService.getGameStats(g.id);
      text +=
        `🎮 <b>${g.title}</b>\n` +
        `  👥 Ishtirokchilar: ${stats.participants}\n` +
        `  🔢 Raqamlar: ${stats.numbers}\n\n`;
    }

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'mod:main')]]),
    });
  });

  // Mod all participants (choose game first)
  bot.action('mod:participants', async (ctx) => {
    if (!ctx.isModerator && !ctx.isAdmin)
      return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    await ctx.answerCbQuery();

    const games = await gameService.getModeratorGames(ctx.from.id);
    if (!games.length) {
      return ctx.editMessageText('🎮 Biriktirilgan o\'yinlar topilmadi.', {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'mod:main')]]),
      });
    }

    const buttons = games.map((g) => [
      Markup.button.callback(`🎮 ${g.title}`, `mod:participants:${g.id}`),
    ]);
    buttons.push([Markup.button.callback('🔙 Orqaga', 'mod:main')]);

    await ctx.editMessageText('🎮 O\'yin tanlang:', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
  });

  // Single game management
  bot.action(/^mod:game:(.+)$/, async (ctx) => {
    if (!ctx.isModerator && !ctx.isAdmin)
      return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();

    const game = await gameService.getGameById(gameId);
    const stats = await gameService.getGameStats(gameId);

    await ctx.editMessageText(msgs.gameStats(game, stats), {
      parse_mode: 'HTML',
      ...modGameMenu(gameId),
    });
  });

  // Mod stats for specific game
  bot.action(/^mod:stats:(.+)$/, async (ctx) => {
    if (!ctx.isModerator && !ctx.isAdmin)
      return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();

    const game = await gameService.getGameById(gameId);
    const stats = await gameService.getGameStats(gameId);

    await ctx.editMessageText(msgs.gameStats(game, stats), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', `mod:game:${gameId}`)]]),
    });
  });

  // Participants list
  bot.action(/^mod:participants:(.+)$/, async (ctx) => {
    if (!ctx.isModerator && !ctx.isAdmin)
      return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();

    const participants = await gameService.getLeaderboard(gameId, 20);
    const text = msgs.topList(participants);

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', `mod:game:${gameId}`)]]),
    });
  });

  // Export JSON
  bot.action(/^mod:export:(.+)$/, async (ctx) => {
    if (!ctx.isModerator && !ctx.isAdmin)
      return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    const gameId = ctx.match[1];
    await ctx.answerCbQuery('📊 Ma\'lumotlar yuklanmoqda...');

    try {
      const game = await gameService.getGameById(gameId);
      const data = await gameService.getGameExportData(gameId);

      const fileName = `participants_${gameId}.json`;
      const buffer = Buffer.from(JSON.stringify(data, null, 2));

      await ctx.replyWithDocument(
        { source: buffer, filename: fileName },
        {
          caption: `🎮 <b>${game.title}</b>\n📊 Ishtirokchilar ro'yxati (JSON)`,
          parse_mode: 'HTML',
        }
      );
    } catch (err) {
      console.error('Export error:', err.message);
      await ctx.reply('❌ Ma\'lumotlarni eksport qilishda xatolik yuz berdi.');
    }
  });

  // Mod broadcast (send to group)
  bot.action(/^mod:broadcast:(.+)$/, async (ctx) => {
    if (!ctx.isModerator && !ctx.isAdmin)
      return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    
    const gameId = ctx.match[1];
    
    // Check if user is actually a moderator for this specific game
    const isGameModerator = await gameService.isModerator(gameId, ctx.from.id);
    if (!isGameModerator && !ctx.isAdmin) {
      return ctx.answerCbQuery('⛔ Siz faqat o\'z guruhlaringizga xabar yubora olasiz!', { show_alert: true });
    }
    
    await ctx.answerCbQuery();

    ctx.session = ctx.session || {};
    ctx.session.modBroadcastGameId = gameId;
    ctx.session.waitingModBroadcastMessage = true;

    await ctx.reply(
      '📢 Guruhga yuboriladigan xabarni kiriting:\n\n' +
        '<i>1. Avval xabar matni, rasm yoki mediani yuboring\n' +
        '2. Keyin tugma uchun URL va matn kiritishingiz mumkin</i>',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor qilish', 'cancel_mod_broadcast')]]),
      }
    );
  });

  bot.action('cancel_mod_broadcast', async (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.waitingModBroadcast = false;
    ctx.session.waitingModBroadcastMessage = false;
    ctx.session.waitingModBroadcastButton = false;
    ctx.session.modBroadcastMessageData = null;
    await ctx.answerCbQuery('❌ Bekor qilindi');
    await ctx.deleteMessage().catch(() => {});
  });
}

module.exports = { handleModCommand, registerModCallbacks };
