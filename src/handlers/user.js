const { Markup, Scenes } = require('telegraf');
const gameService = require('../services/gameService');
const userService = require('../services/userService');
const { msgs, userName } = require('../utils/messages');
const { userMainMenu, userGameSelectMenu, cancelMenu } = require('../utils/keyboards');

/**
 * Handle /start command
 * - /start  → show available games
 * - /start ref_GAMEID_USERID → auto-join specific game via referral
 */
async function handleStart(ctx) {
  const args = ctx.message?.text?.split(' ')[1];

  // Deep link: ref_GAMEID_INVITERID
  if (args?.startsWith('ref_')) {
    const parts = args.replace('ref_', '').split('_');
    if (parts.length >= 2) {
      const gameId = parts[0];
      const inviterId = parseInt(parts[1]);
      return handleRefJoin(ctx, gameId, inviterId);
    }
  }

  // Direct entry: show active games to choose from
  const games = await gameService.getAllActiveGames();

  if (!games.length) {
    return ctx.reply(
      `👋 <b>Salom, ${ctx.from.first_name}!</b>\n\n` +
        `Hozirda faol o'yinlar mavjud emas.\n` +
        `Iltimos, kuting yoki guruh adminiga murojaat qiling.`,
      { parse_mode: 'HTML' }
    );
  }

  // Check roles
  let roleMsg = '';
  if (ctx.isAdmin) {
    roleMsg = '\n\n👔 <b>Siz adminsiz!</b>\nAdmin panel: /admin';
  } else if (ctx.isModerator) {
    roleMsg = '\n\n👔 <b>Siz moderatorsiz!</b>\nModerator paneli: /moderator';
  }

  if (games.length === 1) {
    // Only one game - auto join
    return joinGame(ctx, games[0].id, null, roleMsg);
  }

  await ctx.reply(
    `👋 <b>Salom, ${ctx.from.first_name}!</b>\n\nQaysi o'yinga qo'shilmoqchisiz?${roleMsg}`,
    { parse_mode: 'HTML', ...userGameSelectMenu(games) }
  );
}


/**
 * Handle joining via referral link
 */
async function handleRefJoin(ctx, gameId, inviterId) {
  try {
    const game = await gameService.getGameById(gameId);
    if (!game || !game.is_active) {
      return ctx.reply(
        '❌ Bu o\'yin faol emas yoki topilmadi.',
        { parse_mode: 'HTML' }
      );
    }

    const selfInvite = inviterId === ctx.from.id;
    const effectiveInviterId = selfInvite ? null : inviterId;

    const { participant, isNew, wasRejoined } = await gameService.getOrCreateParticipant(
      gameId,
      ctx.from.id,
      effectiveInviterId
    );

    // If invited by someone else (not self), credit the inviter
    if (effectiveInviterId && (isNew || wasRejoined)) {
      const result = await gameService.processNewInvite(gameId, effectiveInviterId);

      if (result) {
        const inviterUser = await userService.getUserById(effectiveInviterId);
        const inviterName = [inviterUser?.first_name, inviterUser?.last_name].filter(Boolean).join(' ');
        const memberName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ');
        
        // Create mention for inviter
        const inviterMention = inviterUser?.username ? `@${inviterUser.username}` : inviterName;

        // Announce in group
        await ctx.telegram.sendMessage(
          game.group_id,
          `🤝 ${inviterMention} guruhga yangi a'zo qo'shdi!\n\n` +
            `👤 <b>${memberName}</b> o'yinga qo'shildi.\n` +
            `📊 Keyingi raqamgacha: <b>${result.updated.invite_count % game.people_per_number}/${game.people_per_number}</b>\n\n` +
            `🎁 <b>Raqamlaringizni ko'rish uchun botga o'ting:</b>\n👉 @${(await ctx.telegram.getMe()).username}`,
          { parse_mode: 'HTML' }
        );

        if (result?.numberAssigned) {
          // Notify inviter that they got a new number
          try {
            await ctx.telegram.sendMessage(
              effectiveInviterId,
              msgs.numberAssigned(
                userName(inviterUser),
                result.numberAssigned,
                result.updated.invite_count
              ),
              { parse_mode: 'HTML' }
            );

            // Also announce number assignment in group
            await ctx.telegram.sendMessage(
              game.group_id,
              msgs.numberAssigned(
                inviterName,
                result.numberAssigned,
                result.updated.invite_count
              ),
              { parse_mode: 'HTML' }
            );

            // Send notification to user in bot
            await ctx.reply(
              msgs.numberAssigned(
                userName(inviterUser),
                result.numberAssigned,
                result.updated.invite_count
              ),
              { parse_mode: 'HTML' }
            );

          } catch (err) {
            console.error('Notify inviter error:', err.message);
          }
        }
      }
    }

    // Check roles
    let roleMsg = '';
    if (ctx.isAdmin) {
      roleMsg = '\n\n👔 <b>Siz adminsiz!</b>\nAdmin panel: /admin';
    } else if (ctx.isModerator) {
      roleMsg = '\n\n👔 <b>Siz moderatorsiz!</b>\nModerator paneli: /moderator';
    }

    await showUserMenu(ctx, game, participant, roleMsg);

  } catch (err) {
    console.error('RefJoin error:', err);
    await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
}

/**
 * Join a game by ID
 */
async function joinGame(ctx, gameId, inviterId, roleMsg = '') {
  const game = await gameService.getGameById(gameId);
  if (!game || !game.is_active) {
    return ctx.reply('❌ O\'yin faol emas.');
  }

  const { participant } = await gameService.getOrCreateParticipant(gameId, ctx.from.id, inviterId);
  const details = await gameService.getParticipantDetails(gameId, ctx.from.id);
  await showUserMenu(ctx, game, details || participant, roleMsg);
}


/**
 * Show user's main menu for a game
 */
async function showUserMenu(ctx, game, participant, roleMsg = '') {
  const text = msgs.userWelcome(ctx.from, game, participant) + roleMsg;
  
  // Save current game ID in session
  ctx.session = ctx.session || {};
  ctx.session.currentGameId = game.id;
  
  // Explicitly save session
  ctx.session = { ...ctx.session };
  
  await ctx.reply(text, {
    parse_mode: 'HTML',
    ...userMainMenu(game.id),
  });
}


// =====================================================
// TRANSFER SCENE
// =====================================================
const transferScene = new Scenes.WizardScene(
  'transfer',

  // Step 1: Ask for recipient — also grab gameId from scene state
  async (ctx) => {
    // Inherit gameId passed via ctx.scene.enter('transfer', { gameId })
    if (ctx.scene.state?.gameId) {
      ctx.wizard.state.gameId = ctx.scene.state.gameId;
    }

    if (!ctx.wizard.state.gameId) {
      await ctx.reply('❌ O\'yin aniqlanmadi. Qaytadan urinib ko\'ring.');
      return ctx.scene.leave();
    }

    await ctx.reply(
      '🔄 <b>Raqam o\'tkazish</b>\n\nRaqamni kimga o\'tkazmoqchisiz?\n' +
        '<i>Foydalanuvchi ID yoki @username kiriting:</i>',
      { parse_mode: 'HTML', ...cancelMenu() }
    );
    return ctx.wizard.next();
  },

  // Step 2: Find recipient
  async (ctx) => {
    if (ctx.callbackQuery?.data === 'cancel') {
      await ctx.answerCbQuery();
      return ctx.scene.leave();
    }

    const text = ctx.message?.text?.trim();
    if (!text) return;

    let recipient;
    if (text.startsWith('@')) {
      recipient = await userService.getUserByUsername(text);
    } else {
      const id = parseInt(text);
      if (!isNaN(id)) recipient = await userService.getUserById(id);
    }

    if (!recipient) {
      await ctx.reply('❌ Foydalanuvchi topilmadi. Qaytadan kiriting:');
      return;
    }

    ctx.wizard.state.recipientId = recipient.id;
    ctx.wizard.state.recipientName = [recipient.first_name, recipient.last_name]
      .filter(Boolean)
      .join(' ');

    // Get user's numbers
    const gameId = ctx.wizard.state.gameId;
    const numbers = await gameService.getUserNumbers(gameId, ctx.from.id);

    if (!numbers.length) {
      await ctx.reply('❌ Sizda o\'tkazish uchun raqam yo\'q.');
      return ctx.scene.leave();
    }

    const buttons = numbers.map((n) => [
      Markup.button.callback(`🏷 ${n.number}-raqam`, `transfer_num:${n.number}`),
    ]);
    buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_transfer')]);

    await ctx.reply(
      `👤 Qabul qiluvchi: <b>${ctx.wizard.state.recipientName}</b>\n\nQaysi raqamni o\'tkazmoqchisiz?`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
    );
    return ctx.wizard.next();
  },

  // Step 3: Confirm transfer
  async (ctx) => {
    if (ctx.callbackQuery?.data === 'cancel_transfer') {
      await ctx.answerCbQuery();
      return ctx.scene.leave();
    }

    if (ctx.callbackQuery?.data?.startsWith('transfer_num:')) {
      const number = parseInt(ctx.callbackQuery.data.split(':')[1]);
      ctx.wizard.state.number = number;
      await ctx.answerCbQuery();

      await ctx.editMessageText(
        `⚠️ <b>Tasdiqlash</b>\n\n` +
          `🏷 <b>${number}-raqam</b> ni\n` +
          `👤 <b>${ctx.wizard.state.recipientName}</b> ga o\'tkazmoqchimisiz?`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Ha', 'confirm_transfer'),
              Markup.button.callback('❌ Yo\'q', 'cancel_transfer'),
            ],
          ]),
        }
      );
    }

    if (ctx.callbackQuery?.data === 'confirm_transfer') {
      const { gameId, recipientId, recipientName, number } = ctx.wizard.state;
      try {
        await gameService.transferNumber(gameId, ctx.from.id, recipientId, number);
        await ctx.editMessageText(
          `✅ <b>${number}-raqam</b> <b>${recipientName}</b> ga muvaffaqiyatli o\'tkazildi!`,
          { parse_mode: 'HTML' }
        );

        // Notify recipient
        try {
          await ctx.telegram.sendMessage(
            recipientId,
            `🎁 <b>Sizga raqam sovg'a qilindi!</b>\n\n` +
              `🏷 <b>${number}-raqam</b> sizga o\'tkazildi.`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {}
      } catch (err) {
        await ctx.editMessageText('❌ O\'tkazish amalga oshmadi: ' + err.message);
      }
      return ctx.scene.leave();
    }
  }
);

/**
 * Recover current game ID from database if session is lost
 */
async function ensureGameId(ctx) {
  if (ctx.session?.currentGameId) return ctx.session.currentGameId;

  // 1. Try to find games where user is a participant
  const userGames = await gameService.getUserGames(ctx.from.id);
  if (userGames.length > 0) {
    ctx.session = ctx.session || {};
    ctx.session.currentGameId = userGames[0].id;
    return userGames[0].id;
  }

  // 2. Fallback to moderator games
  const modGames = await gameService.getModeratorGames(ctx.from.id);
  if (modGames.length > 0) {
    ctx.session = ctx.session || {};
    ctx.session.currentGameId = modGames[0].id;
    return modGames[0].id;
  }

  // 3. Fallback to games created by the user (for admins)
  const createdGames = await gameService.getCreatedGames(ctx.from.id);
  if (createdGames.length > 0) {
    ctx.session = ctx.session || {};
    ctx.session.currentGameId = createdGames[0].id;
    return createdGames[0].id;
  }

  return null;
}

// =====================================================
// USER CALLBACK HANDLERS
// =====================================================
function registerUserCallbacks(bot) {
  // Join game from selection
  bot.action(/^user:join_game:(.+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    await joinGame(ctx, gameId, null);
  });

bot.hears('🔢 Raqamlarim', async (ctx) => {
  const gameId = await ensureGameId(ctx);
  
  if (!gameId) {
    return ctx.reply('❌ Iltimos, avval o\'yinga qo\'shiling.');
  }
  
  const numbers = await gameService.getUserNumbers(gameId, ctx.from.id);
  await ctx.reply(msgs.userNumbers(numbers), { parse_mode: 'HTML' });
});

// My numbers
bot.action(/^user:numbers:(.+)$/, async (ctx) => {
  const gameId = ctx.match[1];
  await ctx.answerCbQuery();
  const numbers = await gameService.getUserNumbers(gameId, ctx.from.id);
  await ctx.reply(msgs.userNumbers(numbers), { parse_mode: 'HTML' });
});

// Stats
bot.action(/^user:stats:(.+)$/, async (ctx) => {
  const gameId = ctx.match[1];
  await ctx.answerCbQuery();
  const participant = await gameService.getParticipantDetails(gameId, ctx.from.id);
  await ctx.reply(msgs.userStats(participant), { parse_mode: 'HTML' });
});

bot.hears('📊 Statistika', async (ctx) => {
  const gameId = await ensureGameId(ctx);
  
  if (!gameId) {
    return ctx.reply('❌ Iltimos, avval o\'yinga qo\'shiling.');
  }
  
  const participant = await gameService.getParticipantDetails(gameId, ctx.from.id);
  await ctx.reply(msgs.userStats(participant), { parse_mode: 'HTML' });
});

  // Invite link
  bot.action(/^user:invite:(.+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();

    const game = await gameService.getGameById(gameId);
    const link = await gameService.getOrCreateUniqueInviteLink(
      gameId,
      ctx.from.id,
      game.group_id,
      ctx
    );

    if (!link) {
      return ctx.reply('❌ Guruh linkini yaratishda xatolik yuz berdi. Iltimos, keyinroq urinib ko\'ring.');
    }

    await ctx.reply(
      `🏘 <b>Guruhning maxsus taklif linki:</b>\n\n` +
        `🚀 <a href="${link}">${link}</a>\n\n` +
        `☝️ <i>Nusxa olish uchun link ustiga bosing:</i>\n` +
        `<code>${link}</code>\n\n` +
        `Yangi a'zolar ushbu link orqali guruhga kirsa, sizga ball yoziladi!\n` +
        `Har <b>${game.people_per_number}</b> ta odam uchun 1 ta raqam beriladi!`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.url('📤 Ulashish', `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Guruhimizga qo'shiling va o'yinda qatnashing!")}`)],
        ]),
      }
    );
  });

  bot.hears('🔗 Taklif linki', async (ctx) => {
  const gameId = await ensureGameId(ctx);
  
  if (!gameId) {
    return ctx.reply('❌ Iltimos, avval o\'yinga qo\'shiling.');
  }

    const game = await gameService.getGameById(gameId);
    const link = await gameService.getOrCreateUniqueInviteLink(
      gameId,
      ctx.from.id,
      game.group_id,
      ctx
    );

    if (!link) {
      return ctx.reply('❌ Guruh linkini yaratishda xatolik yuz berdi. Iltimos, keyinroq urinib ko\'ring.');
    }

    await ctx.reply(
      `🏘 <b>Guruhning maxsus taklif linki:</b>\n\n` +
        `🚀 <a href="${link}">${link}</a>\n\n` +
        `☝️ <i>Nusxa olish uchun link ustiga bosing:</i>\n` +
        `<code>${link}</code>\n\n` +
        `Yangi a'zolar ushbu link orqali guruhga kirsa, sizga ball yoziladi!\n` +
        `Har <b>${game.people_per_number}</b> ta odam uchun 1 ta raqam beriladi!`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.url('📤 Ulashish', `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Guruhimizga qo'shiling va o'yinda qatnashing!")}`)],
        ]),
      }
    );
  });

  bot.hears('📜 O\'yin shartlari', async (ctx) => {
  const gameId = await ensureGameId(ctx);
  
  if (!gameId) {
    return ctx.reply('❌ Iltimos, avval o\'yinga qo\'shiling.');
  }
  
  const game = await gameService.getGameById(gameId);
  await ctx.reply(
    `📋 <b>${game.title} - O'yin shartlari</b>\n\n${game.conditions || 'Belgilanmagan'}`,
    { parse_mode: 'HTML' }
  );
});

  // Game conditions
  bot.action(/^user:conditions:(.+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();
    const game = await gameService.getGameById(gameId);
    await ctx.reply(
      `📋 <b>${game.title} - O'yin shartlari</b>\n\n${game.conditions || 'Belgilanmagan'}`,
      { parse_mode: 'HTML' }
    );
  });

  bot.hears('🏆 TOP ishtirokchilar', async (ctx) => {
  const gameId = await ensureGameId(ctx);
  
  if (!gameId) {
    return ctx.reply('❌ Iltimos, avval o\'yinga qo\'shiling.');
  }
  
  const top = await gameService.getLeaderboard(gameId, 10);
  await ctx.reply(msgs.topList(top), { parse_mode: 'HTML' });
});

  // Transfer
  bot.action(/^user:transfer:(.+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();
    ctx.scene.enter('transfer', { gameId });
  });

  bot.hears('🔄 Transfer', async (ctx) => {
  const gameId = await ensureGameId(ctx);
  
  if (!gameId) {
    return ctx.reply('❌ Iltimos, avval o\'yinga qo\'shiling.');
  }
  ctx.scene.enter('transfer', { gameId });
});

  // Back to main user menu
  bot.action(/^user:back:(.+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});

    const game = await gameService.getGameById(gameId);
    const participant = await gameService.getParticipantDetails(gameId, ctx.from.id);

    if (!participant) {
      return ctx.reply('❌ Siz bu o\'yinda ro\'yxatdan o\'tmagansiz.');
    }

    await ctx.reply(msgs.userWelcome(ctx.from, game, participant), {
      parse_mode: 'HTML',
      ...userMainMenu(gameId),
    });
  });
}

module.exports = {
  handleStart,
  handleRefJoin,
  joinGame,
  transferScene,
  registerUserCallbacks,
};
