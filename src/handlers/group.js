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

/**
 * Handle new member joining group
 */
async function handleGroupJoin(ctx, bot) {
  const groupId = ctx.chat.id;
  const newMembers = ctx.message.new_chat_members || [];

  const game = await gameService.getActiveGameForGroup(groupId);
  if (!game) return;

  for (const member of newMembers) {
    if (member.is_bot) continue;

    await userService.upsertUser(member);
    await userService.logMemberAction(groupId, member.id, game.id, 'join');

    // Anti-cheat: check leave/rejoin
    const isRejoin = await userService.checkLeaveRejoin(groupId, member.id, game.start_date);
    if (isRejoin) {
      await require('../middlewares/antiCheat').disqualifyUser(game.id, member.id);
      const memberName = [member.first_name, member.last_name].filter(Boolean).join(' ');
      await ctx.reply(
        `⚠️ <b>Anti-cheat:</b> <b>${memberName}</b> avval guruhdan chiqib qayta kirgan. O'yindan chetlashtirildi.`,
        { parse_mode: 'HTML' }
      );
      continue;
    }

    // Check if joined via bot (has participant record with inviter)
    const { data: existingParticipant } = await require('../database/supabase')
      .from('game_participants')
      .select('*, invited_by')
      .eq('game_id', game.id)
      .eq('user_id', member.id)
      .maybeSingle();

    const invitedBy = existingParticipant?.invited_by;

    // Create participant if not exists
    if (!existingParticipant) {
      await gameService.getOrCreateParticipant(game.id, member.id, null);
    }

    // If has inviter, credit them
    if (invitedBy) {
      const result = await gameService.processNewInvite(game.id, invitedBy);
      if (result?.numberAssigned) {
        const inviterUser = await userService.getUserById(invitedBy);
        const inviterDisplayName = [inviterUser?.first_name, inviterUser?.last_name]
          .filter(Boolean)
          .join(' ');

        // Beautiful announcement in group
        await ctx.reply(
          `🎉 <b>Tabriklaymiz!</b>\n\n` +
            `👤 <a href="tg://user?id=${invitedBy}">${inviterDisplayName}</a>\n` +
            `🏷 <b>${result.numberAssigned}-raqam</b>ni qo'lga kiritdi!\n` +
            `👥 Jami taklif: <b>${result.updated.invite_count}</b> kishi`,
          { parse_mode: 'HTML' }
        );

        // Notify inviter in PM
        try {
          await bot.telegram.sendMessage(
            invitedBy,
            msgs.numberAssigned(inviterDisplayName, result.numberAssigned, result.updated.invite_count),
            { parse_mode: 'HTML' }
          );
        } catch (e) {}
      } else if (result?.updated) {
        // Progress update (not yet reached threshold)
        const game2 = result.game;
        const progress = result.updated.invite_count % game2.people_per_number;
        const needed = game2.people_per_number;
        const memberName = [member.first_name, member.last_name].filter(Boolean).join(' ');
        const inviterUser = await userService.getUserById(invitedBy);
        const inviterName = [inviterUser?.first_name, inviterUser?.last_name].filter(Boolean).join(' ');

        await ctx.reply(
          msgs.newMemberJoined(inviterName, memberName, progress, needed),
          { parse_mode: 'HTML' }
        );
      }
    }
  }
}

/**
 * Handle member leaving group
 */
async function handleGroupLeave(ctx, bot) {
  const groupId = ctx.chat.id;
  const leftUser = ctx.message.left_chat_member;
  if (!leftUser || leftUser.is_bot) return;

  const game = await gameService.getActiveGameForGroup(groupId);
  if (!game) return;

  await userService.logMemberAction(groupId, leftUser.id, game.id, 'leave');

  // Find participant and inviter
  const { data: participant } = await require('../database/supabase')
    .from('game_participants')
    .select('*')
    .eq('game_id', game.id)
    .eq('user_id', leftUser.id)
    .maybeSingle();

  if (!participant?.invited_by) return;

  // Deduct from inviter
  const updatedInviter = await gameService.processUserLeft(
    game.id,
    leftUser.id,
    participant.invited_by
  );

  const leftName = [leftUser.first_name, leftUser.last_name].filter(Boolean).join(' ');

  // Notify inviter
  try {
    await bot.telegram.sendMessage(
      participant.invited_by,
      msgs.userLeftWarning('Siz', leftName) +
        `\n👥 Joriy taklif soningiz: <b>${updatedInviter?.invite_count || 0}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {}
}

module.exports = { registerGroupHandlers };
