const userService = require('../services/userService');
const gameService = require('../services/gameService');
const { msgs, userName } = require('../utils/messages');
const { handleNewMembers, handleMemberLeft } = require('../middlewares/antiCheat');

/**
 * Register group-related event handlers
 */
function registerGroupHandlers(bot) {
  // Bot added to group
  bot.on('my_chat_member', async (ctx) => {
    const update = ctx.update.my_chat_member;
    if (!update) return;

    const chat = update.chat;
    if (!['group', 'supergroup'].includes(chat.type)) return;

    const newStatus = update.new_chat_member?.status;

    if (['member', 'administrator'].includes(newStatus)) {
      // Bot was added to group
      await userService.upsertGroup(chat);
      console.log(`[GROUP] Bot added to: ${chat.title} (${chat.id})`);

      await ctx.telegram.sendMessage(
        chat.id,
        `👋 <b>Salom!</b> Men bu guruhga qo'shildim.\n\n` +
          `Admin panel orqali o'yin yaratishingiz mumkin.\n` +
          `Bot: @${(await ctx.telegram.getMe()).username}`,
        { parse_mode: 'HTML' }
      );
    } else if (newStatus === 'left' || newStatus === 'kicked') {
      // Bot removed from group
      await require('../database/supabase')
        .from('groups')
        .update({ is_active: false })
        .eq('id', chat.id);
      console.log(`[GROUP] Bot removed from: ${chat.title} (${chat.id})`);
    }
  });

  // New member joined group
  bot.on('message', async (ctx, next) => {
    if (ctx.message?.new_chat_members) {
      await handleNewMembers(ctx, bot);
    } else if (ctx.message?.left_chat_member) {
      await handleMemberLeft(ctx, bot);
    }
    return next();
  });

  // /top command in group
  bot.command('top', async (ctx) => {
    if (!['group', 'supergroup'].includes(ctx.chat?.type)) return;
    const game = await gameService.getActiveGameForGroup(ctx.chat.id);
    if (!game) return ctx.reply('❌ Bu guruhda faol o\'yin yo\'q.');

    const top = await gameService.getLeaderboard(game.id, 10);
    await ctx.reply(msgs.topList(top), { parse_mode: 'HTML' });
  });

  // /mystats command in group
  bot.command('mystats', async (ctx) => {
    if (!['group', 'supergroup'].includes(ctx.chat?.type)) return;
    const game = await gameService.getActiveGameForGroup(ctx.chat.id);
    if (!game) return ctx.reply('❌ Bu guruhda faol o\'yin yo\'q.');

    const participant = await gameService.getParticipantDetails(game.id, ctx.from.id);
    if (!participant) return ctx.reply('❌ Siz bu o\'yinda qatnashmaysiz.');

    const { rank, total } = await gameService.getUserRank(game.id, ctx.from.id);
    await ctx.reply(msgs.userStats(participant, rank, total), { parse_mode: 'HTML' });
  });

  // /gameinfo command in group
  bot.command('gameinfo', async (ctx) => {
    if (!['group', 'supergroup'].includes(ctx.chat?.type)) return;
    const game = await gameService.getActiveGameForGroup(ctx.chat.id);
    if (!game) return ctx.reply('❌ Bu guruhda faol o\'yin yo\'q.');

    const stats = await gameService.getGameStats(game.id);
    await ctx.reply(msgs.gameStats(game, stats), { parse_mode: 'HTML' });
  });
}

module.exports = { registerGroupHandlers };
