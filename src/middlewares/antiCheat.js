const userService = require('../services/userService');
const gameService = require('../services/gameService');
const { msgs } = require('../utils/messages');

/**
 * Handles new_chat_members event in groups
 * - Registers participant
 * - Credits inviter
 * - Assigns number if threshold met
 */
/**
 * Handles chat_member update in groups (detect unique invite links)
 */
async function handleChatMemberUpdate(ctx) {
  const update = ctx.update.chat_member;
  if (!update) return;

  const groupId = ctx.chat.id;
  const member = update.new_chat_member?.user;

  // New member joining group
  if (update.old_chat_member.status === 'left' && update.new_chat_member.status === 'member') {
    const inviteLink = update.invite_link?.invite_link;
    if (!inviteLink) {
      console.log(`[CHAT_MEMBER] No invite link for user ${member?.id}`);
      return;
    }

    const game = await gameService.getActiveGameForGroup(groupId);
    if (!game) {
      console.log(`[CHAT_MEMBER] No active game for group ${groupId}`);
      return;
    }

    const inviterId = await gameService.findInviterByInviteLink(game.id, inviteLink);
    console.log(`[CHAT_MEMBER] Found inviter ${inviterId} for link ${inviteLink}`);
    
    if (inviterId) {
      // Store whom invited them in DB now
      const result = await gameService.getOrCreateParticipant(game.id, member.id, inviterId);
      console.log(`[INVITE-LINK] User ${member.id} joined via ${inviterId}'s link, isNew: ${result.isNew}, justInvited: ${result.justInvited}`);
    }
  }
}

/**
 * Handles new_chat_members event in groups
 */
async function handleNewMembers(ctx) {
  const groupId = ctx.chat.id;
  const newMembers = ctx.message.new_chat_members || [];

  const game = await gameService.getActiveGameForGroup(groupId);
  if (!game) return;

  const botInfo = await ctx.telegram.getMe();

  for (const member of newMembers) {
    if (member.is_bot) continue;

    // Save user info
    await userService.upsertUser(member);
    
    // Identify inviter (if added manually via "Add members" button)
    let manualInviterId = null;
    if (ctx.from && ctx.from.id !== member.id) {
      manualInviterId = ctx.from.id;
      console.log(`[NEW_MEMBERS] Manual add detected: ${manualInviterId} added ${member.id}`);
    }

    // Log join
    await userService.logMemberAction(groupId, member.id, game.id, 'join');

    // Anti-cheat check
    const isCheat = await userService.checkLeaveRejoin(groupId, member.id, game.start_date);
    if (isCheat) {
      await disqualifyUser(game.id, member.id);
      const name = [member.first_name, member.last_name].filter(Boolean).join(' ');
      await ctx.reply(
        `⚠️ <b>Anti-cheat tizimi:</b>\n` +
          `<b>${name}</b> avval guruhdan chiqib qayta kirgan. O'yindan chetlashtirildi.`,
        { parse_mode: 'HTML' }
      );
      continue;
    }

    // Register / Get participant record
    const { participant, isNew, wasRejoined, justInvited } = await gameService.getOrCreateParticipant(
      game.id,
      member.id,
      manualInviterId
    );
    console.log(`[NEW_MEMBERS] Participant result: isNew=${isNew}, wasRejoined=${wasRejoined}, justInvited=${justInvited}, invited_by=${participant?.invited_by}`);

    // Final inviter
    const inviterId = participant?.invited_by || manualInviterId;
    console.log(`[CREDIT] Final inviterId: ${inviterId}, conditions: isNew=${isNew}, wasRejoined=${wasRejoined}, justInvited=${justInvited}`);

    // Credit and Announce
    if (inviterId && (isNew || wasRejoined || justInvited)) {

      // Ensure the inviter is also in participant table
      await gameService.getOrCreateParticipant(game.id, inviterId, null);

      // Process credit
      console.log(`[CREDIT] Processing credit for inviter ${inviterId}`);
      const result = await gameService.processNewInvite(game.id, inviterId);
      console.log(`[CREDIT] Result:`, result);

      if (result) {
        const inviterUser = await userService.getUserById(inviterId);
        const inviterName = [inviterUser?.first_name, inviterUser?.last_name].filter(Boolean).join(' ');
        const memberName = [member.first_name, member.last_name].filter(Boolean).join(' ');
        
        // Create mention for inviter
        const inviterMention = inviterUser?.username ? `@${inviterUser.username}` : inviterName;

        // Celebratory greeting
        await ctx.reply(
          `🤝 ${inviterMention} guruhga yangi a'zo qo'shdi!\n\n` +
            `👤 <b>${memberName}</b> o'yinga qo'shildi.\n` +
            `📊 Keyingi raqamgacha: <b>${result.updated.invite_count % game.people_per_number}/${game.people_per_number}</b>\n\n` +
            `🎁 <b>Raqamlaringizni ko'rish uchun botga o'ting:</b>\n👉 @${botInfo.username}`,
          { parse_mode: 'HTML' }
        );

        // Number assignment check
        if (result.numberAssigned) {
          const celebration = msgs.numberAssigned(inviterName, result.numberAssigned, result.updated.invite_count);
          try {
            await ctx.telegram.sendMessage(inviterId, celebration, { parse_mode: 'HTML' });
          } catch (e) {}
          await ctx.reply(celebration, { parse_mode: 'HTML' });
          
          // Also send notification to inviter in bot if they're the current user
          if (ctx.from && ctx.from.id === inviterId) {
            try {
              await ctx.telegram.sendMessage(inviterId, celebration, { parse_mode: 'HTML' });
            } catch (e) {}
          }
        }
      }
    }
  }
}


/**
 * Handles left_chat_member event in groups
 * - Deducts count from inviter
 * - Notifies inviter
 */
async function handleMemberLeft(ctx, bot) {
  const groupId = ctx.chat.id;
  const leftUser = ctx.message.left_chat_member;
  if (!leftUser || leftUser.is_bot) return;

  const game = await gameService.getActiveGameForGroup(groupId);
  if (!game) return;

  // Log leave
  await userService.logMemberAction(groupId, leftUser.id, game.id, 'leave');

  // Get participant to find inviter
  const { data: participant } = await require('../database/supabase')
    .from('game_participants')
    .select('*, users!user_id(*)')

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

  // Notify inviter via PM
  const leftName = [leftUser.first_name, leftUser.last_name].filter(Boolean).join(' ');
  const inviterName = updatedInviter
    ? `foydalanuvchi`
    : `foydalanuvchi`;

  try {
    await bot.telegram.sendMessage(
      participant.invited_by,
      `⚠️ <b>Diqqat!</b>\n\n` +
        `❌ <b>${leftName}</b> guruhdan chiqib ketdi.\n` +
        `📉 Sizning hisobingizdan 1 ta kishi ayirildi.\n` +
        `👥 Joriy taklif soningiz: <b>${updatedInviter?.invite_count || 0}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('Failed to notify inviter:', err.message);
  }
}

/**
 * Anti-bot check: detect if user joined via bot/nakrutka
 * Simple heuristic: no username + no profile photo = likely bot
 */
function isLikelyBot(member) {
  // Telegram bots always have is_bot = true, so this is extra check
  return !member.username && !member.first_name;
}

/**
 * Disqualify a user from a game
 */
async function disqualifyUser(gameId, userId) {
  await require('../database/supabase')
    .from('game_participants')
    .update({ disqualified: true, is_active: false })
    .eq('game_id', gameId)
    .eq('user_id', userId);
}

module.exports = {
  handleNewMembers,
  handleMemberLeft,
  disqualifyUser,
  handleChatMemberUpdate,
};

