const { Scenes, Markup } = require('telegraf');
const gameService = require('../services/gameService');
const userService = require('../services/userService');
const { msgs } = require('../utils/messages');
const {
  adminMainMenu,
  adminGameMenu,
  adminBroadcastMenu,
  confirmMenu,
  cancelMenu,
} = require('../utils/keyboards');

// =====================================================
// ADMIN SCENE: Create Game
// =====================================================
const createGameScene = new Scenes.WizardScene(
  'create_game',

  // Step 1: Select group
  async (ctx) => {
    const groups = await userService.getAllGroups();
    if (!groups.length) {
      await ctx.reply('❌ Bot hech qanday guruhga qo\'shilmagan. Avval botni guruhga admin qilib qo\'shing.');
      return ctx.scene.leave();
    }

    const buttons = groups.map((g) => [
      Markup.button.callback(g.title, `select_group:${g.id}`),
    ]);
    buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel_scene')]);

    await ctx.reply('🏘 O\'yin yaratmoqchi bo\'lgan guruhni tanlang:', {
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
    });
    return ctx.wizard.next();
  },

  // Step 2: Get game title
  async (ctx) => {
    if (ctx.callbackQuery?.data === 'cancel_scene') {
      await ctx.answerCbQuery();
      await ctx.reply('❌ Bekor qilindi.');
      return ctx.scene.leave();
    }

    if (ctx.callbackQuery?.data?.startsWith('select_group:')) {
      ctx.wizard.state.groupId = ctx.callbackQuery.data.split(':')[1];
      await ctx.answerCbQuery();
      await ctx.reply('📝 O\'yin nomini kiriting:',
        Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor qilish', 'cancel_scene')]])
      );
      return ctx.wizard.next();
    }
  },

  // Step 3: Get conditions
  async (ctx) => {
    if (ctx.callbackQuery?.data === 'cancel_scene') {
      await ctx.answerCbQuery();
      return ctx.scene.leave();
    }
    if (!ctx.message?.text) return;

    ctx.wizard.state.title = ctx.message.text;
    await ctx.reply(
      '📋 O\'yin shartlarini kiriting (qoidalar, sovrinlar va h.k.):\n\n' +
        '<i>O\'tkazib yuborish uchun /skip yozing</i>',
      { parse_mode: 'HTML', ...cancelMenu() }
    );
    return ctx.wizard.next();
  },

  // Step 4: Get people_per_number
  async (ctx) => {
    if (ctx.message?.text !== '/skip') {
      ctx.wizard.state.conditions = ctx.message?.text || '';
    }

    await ctx.reply(
      '🔢 Har nechta odamga 1 ta raqam berilsin?\n\n' +
        '<i>Masalan: 5 — har 5 ta yangi odam uchun 1 ta raqam</i>\n' +
        '<i>Standart: 5</i>',
      { parse_mode: 'HTML', ...cancelMenu() }
    );
    return ctx.wizard.next();
  },

  // Step 5: Get end date
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    const num = parseInt(text);
    ctx.wizard.state.peoplePerNumber = !isNaN(num) && num > 0 ? num : 5;

    await ctx.reply(
      '📅 O\'yin muddatini kiriting:\n\n' +
        'Format: <code>DD.MM.YYYY HH:MM</code>\n' +
        'Masalan: <code>31.12.2024 23:59</code>\n\n' +
        '<i>Cheksiz o\'yin uchun /skip yozing</i>',
      { parse_mode: 'HTML', ...cancelMenu() }
    );
    return ctx.wizard.next();
  },

  // Step 6: Get moderators
  async (ctx) => {
    if (ctx.message?.text !== '/skip') {
      const text = ctx.message?.text?.trim();
      const [day, month, year, time] = text.replace(' ', '.').split('.');
      const [hour, minute] = (time || '23:59').split(':');
      const date = new Date(+year, +month - 1, +day, +hour || 23, +minute || 59);
      if (isNaN(date.getTime())) {
        await ctx.reply('❌ Noto\'g\'ri format. Qaytadan kiriting (DD.MM.YYYY HH:MM):');
        return;
      }
      ctx.wizard.state.endDate = date.toISOString();
    }

    await ctx.reply(
      '👔 Moderator(lar) ID sini kiriting (vergul bilan ajrating):\n\n' +
        '<i>Masalan: 123456789,987654321</i>\n' +
        '<i>O\'tkazib yuborish uchun /skip</i>',
      { parse_mode: 'HTML', ...cancelMenu() }
    );
    return ctx.wizard.next();
  },

  // Final step: Create game
  async (ctx) => {
    const modIds = [];
    if (ctx.message?.text && ctx.message.text !== '/skip') {
      const ids = ctx.message.text
        .split(',')
        .map((id) => parseInt(id.trim()))
        .filter(Boolean);
      modIds.push(...ids);
    }

    const { groupId, title, conditions, peoplePerNumber, endDate } = ctx.wizard.state;

    try {
      const game = await gameService.createGame({
        groupId: parseInt(groupId),
        title,
        conditions,
        peoplePerNumber,
        endDate,
        createdBy: ctx.from.id,
      });

      // Add moderators
      for (const modId of modIds) {
        try {
          await gameService.addModerator(game.id, modId);
        } catch (e) {
          console.error('Add mod error:', e.message);
        }
      }

      await ctx.reply(msgs.gameCreated(game, game.groups), {
        parse_mode: 'HTML',
        ...adminGameMenu(game.id),
      });

      // Announce in group
      try {
        await ctx.telegram.sendMessage(
          parseInt(groupId),
          `🎮 <b>Yangi o'yin boshlandi!</b>\n\n` +
            `<b>${title}</b>\n\n` +
            `${conditions || ''}\n\n` +
            `📋 Har <b>${peoplePerNumber}</b> ta odam uchun 1 ta unikal raqam beriladi!\n` +
            `🔗 O'yinga qo'shilish uchun botga murojaat qiling.`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        console.error('Group announce error:', e.message);
      }
    } catch (err) {
      console.error('Create game error:', err.message);
      await ctx.reply('❌ Xatolik yuz berdi: ' + err.message);
    }

    return ctx.scene.leave();
  }
);

// =====================================================
// ADMIN COMMAND HANDLERS
// =====================================================

async function handleAdminCommand(ctx) {
  if (!ctx.isAdmin) {
    return ctx.reply('⛔ Ruxsat yo\'q!');
  }

  const stats = await userService.getGlobalStats();
  await ctx.reply(msgs.adminWelcome(stats), {
    parse_mode: 'HTML',
    ...adminMainMenu(),
  });
}

// =====================================================
// ADMIN CALLBACK HANDLERS
// =====================================================

function registerAdminCallbacks(bot) {
  // Main menu
  bot.action('admin:main', async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    const stats = await userService.getGlobalStats();
    await ctx.editMessageText(msgs.adminWelcome(stats), {
      parse_mode: 'HTML',
      ...adminMainMenu(),
    });
    await ctx.answerCbQuery();
  });

  // Groups list
  bot.action('admin:groups', async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    await ctx.answerCbQuery();

    const groups = await userService.getAllGroups();
    if (!groups.length) {
      return ctx.editMessageText('🏘 Hech qanday guruh topilmadi.', {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'admin:main')]]),
      });
    }

    const text = groups
      .map((g, i) => `${i + 1}. <b>${g.title}</b> (ID: <code>${g.id}</code>)`)
      .join('\n');

    await ctx.editMessageText(`🏘 <b>Guruhlar ro'yxati:</b>\n\n${text}`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'admin:main')]]),
    });
  });

  // Games list
  bot.action('admin:games', async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    await ctx.answerCbQuery();

    const games = await gameService.getAllActiveGames();
    const text = msgs.gameList(games);

    const buttons = games.map((g) => [
      Markup.button.callback(`🎮 ${g.title}`, `game:manage:${g.id}`),
    ]);
    buttons.push([Markup.button.callback('🔙 Orqaga', 'admin:main')]);

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
  });

  // Create game
  bot.action('admin:create_game', async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    await ctx.answerCbQuery();
    await ctx.reply('O\'yin yaratish boshlandi:');
    await ctx.scene.enter('create_game');
  });

  // Game management
  bot.action(/^game:manage:(.+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();

    const game = await gameService.getGameById(gameId);
    const stats = await gameService.getGameStats(gameId);
    await ctx.editMessageText(msgs.gameStats(game, stats), {
      parse_mode: 'HTML',
      ...adminGameMenu(gameId),
    });
  });

  // Game settings menu
  bot.action(/^game:settings:(.+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery("⛔ Ruxsat yo'q!", { show_alert: true });
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();

    const game = await gameService.getGameById(gameId);

    await ctx.editMessageText(
      `⚙️ <b>O'yin sozlamalari</b>\n\n` +
        `🎮 <b>${game.title}</b>\n` +
        `📋 Shart: <b>${game.people_per_number}</b> ta odam = 1 raqam\n` +
        `⏱ Muddat: <b>${game.end_date ? new Date(game.end_date).toLocaleString() : 'Cheksiz'}</b>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📝 Nomini o'zgartirish", `game:edit:title:${gameId}`)],
          [Markup.button.callback("📋 Shartlarni o'zgartirish", `game:edit:conditions:${gameId}`)],
          [Markup.button.callback("🔢 Raqam shartini o'zgartirish", `game:edit:ppn:${gameId}`)],
          [Markup.button.callback('👔 Moderatorlarni boshqarish', `game:moderators:${gameId}`)],
          [Markup.button.callback('🔙 Orqaga', `game:manage:${gameId}`)],
        ]),
      }
    );
  });

  // Game moderators list
  bot.action(/^game:moderators:(.+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery("⛔ Ruxsat yo'q!", { show_alert: true });
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();

    const mods = await gameService.getGameModerators(gameId);
    let text = `👔 <b>O'yin moderatorlari</b>\n\n`;

    if (!mods.length) {
      text += '<i>Hali moderatorlar tayinlanmagan.</i>';
    } else {
      mods.forEach((m, i) => {
        const name = [m.users?.first_name, m.users?.last_name].filter(Boolean).join(' ') || 'ID: ' + m.user_id;
        text += `${i + 1}. <b>${name}</b> (<code>${m.user_id}</code>)\n`;
      });
    }

    const buttons = mods.map((m) => [
      Markup.button.callback(`❌ O'chirish: ${m.user_id}`, `game:mod:remove:${gameId}:${m.user_id}`),
    ]);
    buttons.push([Markup.button.callback('➕ Moderator qo\'shish', `game:mod:add:${gameId}`)]);
    buttons.push([Markup.button.callback('🔙 Orqaga', `game:settings:${gameId}`)]);

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
  });

  // Prompt to add moderator
  bot.action(/^game:mod:add:(.+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery("⛔ Ruxsat yo'q!", { show_alert: true });
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();

    ctx.session = ctx.session || {};
    ctx.session.editGameId = gameId;
    ctx.session.editField = 'add_mod';
    ctx.session.waitingEdit = true;

    await ctx.reply(`👔 Moderator ID sini kiriting:`, { ...cancelMenu() });
  });

  // Remove moderator
  bot.action(/^game:mod:remove:(.+):(.+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery("⛔ Ruxsat yo'q!", { show_alert: true });
    const gameId = ctx.match[1];
    const userId = ctx.match[2];
    await ctx.answerCbQuery();

    await gameService.removeModerator(gameId, userId);
    await ctx.reply(`✅ Moderator (ID: ${userId}) o'chirildi.`);
    
    // Refresh list
    const mods = await gameService.getGameModerators(gameId);
    const buttons = mods.map((m) => [
      Markup.button.callback(`❌ O'chirish: ${m.user_id}`, `game:mod:remove:${gameId}:${m.user_id}`),
    ]);
    buttons.push([Markup.button.callback('➕ Moderator qo\'shish', `game:mod:add:${gameId}`)]);
    buttons.push([Markup.button.callback('🔙 Orqaga', `game:settings:${gameId}`)]);

    await ctx.editMessageText(`👔 <b>O'yin moderatorlari</b>\n\nModerator o'chirildi.`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
  });


  // Game-specific broadcast
  bot.action(/^game:broadcast:(.+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery("⛔ Ruxsat yo'q!", { show_alert: true });
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();

    ctx.session = ctx.session || {};
    ctx.session.broadcastTarget = 'game_participants';
    ctx.session.broadcastGameId = gameId;
    ctx.session.waitingBroadcastMessage = true;

    await ctx.reply(
      `📢 <b>O'yin ishtirokchilariga</b> xabar yuboring:\n\n` +
        '<i>1. Avval xabar matni, rasm yoki mediani yuboring\n' +
        '2. Keyin tugma uchun URL va matn kiritishingiz mumkin</i>',
      { parse_mode: 'HTML', ...cancelMenu() }
    );
  });


  // Export JSON
  bot.action(/^game:export:(.+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
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


  // Edit handlers
  bot.action(/^game:edit:(title|conditions|ppn):(.+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery("⛔ Ruxsat yo'q!", { show_alert: true });
    const field = ctx.match[1];
    const gameId = ctx.match[2];
    await ctx.answerCbQuery();

    ctx.session = ctx.session || {};
    ctx.session.editGameId = gameId;
    ctx.session.editField = field;
    ctx.session.waitingEdit = true;

    const prompts = {
      title: "📝 Yangi o'yin nomini kiriting:",
      conditions: "📋 Yangi shartlarni kiriting:",
      ppn: "🔢 Har nechta odamga 1 ta raqam berilsin?",
    };

    await ctx.reply(prompts[field], { ...cancelMenu() });
  });

  // Game stats

  bot.action(/^game:stats:(.+)$/, async (ctx) => {
    if (!ctx.isAdmin && !ctx.isModerator)
      return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();

    const game = await gameService.getGameById(gameId);
    const stats = await gameService.getGameStats(gameId);
    await ctx.editMessageText(msgs.gameStats(game, stats), {
      parse_mode: 'HTML',
      ...adminGameMenu(gameId),
    });
  });

  // End game confirmation
  bot.action(/^game:end:(.+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    const gameId = ctx.match[1];
    await ctx.answerCbQuery();

    await ctx.editMessageText(
      `⚠️ <b>Diqqat!</b>\n\nO'yinni tugatmoqchimisiz?\nBu amalni qaytarib bo'lmaydi!`,
      { parse_mode: 'HTML', ...confirmMenu(`end_game:${gameId}`) }
    );
  });

  // Confirm end game
  bot.action(/^confirm:end_game:(.+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    const gameId = ctx.match[1];
    await ctx.answerCbQuery('✅ O\'yin tugatilyapti...');

    const game = await gameService.endGame(gameId);
    await ctx.editMessageText('✅ O\'yin muvaffaqiyatli tugatildi!', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 O\'yinlar', 'admin:games')]]),
    });

  });

  // Statistics
  bot.action('admin:stats', async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    await ctx.answerCbQuery();

    const stats = await userService.getGlobalStats();
    await ctx.editMessageText(msgs.adminWelcome(stats), {
      parse_mode: 'HTML',
      ...adminMainMenu(),
    });
  });

  // Broadcast menu
  bot.action('admin:broadcast', async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    await ctx.answerCbQuery();
    await ctx.editMessageText(msgs.broadcastMenu(), {
      parse_mode: 'HTML',
      ...adminBroadcastMenu(),
    });
  });

  // Broadcast to users
  bot.action(/^broadcast:(users|groups|game_participants|all)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Ruxsat yo\'q!', { show_alert: true });
    const target = ctx.match[1];
    await ctx.answerCbQuery();

    ctx.session = ctx.session || {};
    ctx.session.broadcastTarget = target;
    ctx.session.waitingBroadcastMessage = true;

    const targetNames = {
      users: '👥 Foydalanuvchilar',
      groups: '🏘 Guruhlar',
      game_participants: '🎮 O\'yin ishtirokchilari',
      all: '📡 Hammasi',
    };

    await ctx.reply(
      `📢 <b>${targetNames[target]}</b> ga xabar yuboring:\n\n` +
        '<i>1. Avval xabar matni, rasm yoki mediani yuboring\n' +
        '2. Keyin tugma uchun URL va matn kiritishingiz mumkin</i>',
      { parse_mode: 'HTML', ...cancelMenu() }
    );
  });

  // Cancel
  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery('❌ Bekor qilindi');
    ctx.session = ctx.session || {};
    ctx.session.waitingBroadcast = false;
    ctx.session.waitingBroadcastMessage = false;
    ctx.session.waitingBroadcastButton = false;
    ctx.session.broadcastMessageData = null;
    await ctx.deleteMessage().catch(() => {});
  });
}

/**
 * Handle incoming message for game editing
 */
async function handleAdminInput(ctx) {
  const session = ctx.session || {};
  if (!session.waitingEdit || !ctx.isAdmin) return false;

  const gameId = session.editGameId;
  const field = session.editField;
  const newValue = ctx.message?.text;

  if (!newValue) return false;

  try {
    const updates = {};
    if (field === 'ppn') {
      const num = parseInt(newValue);
      if (isNaN(num) || num <= 0) {
        await ctx.reply("❌ Noto'g'ri son. Iltimos, musbat butun son kiriting:");
        return true;
      }
      updates.people_per_number = num;
    } else if (field === 'add_mod') {
      const modId = parseInt(newValue);
      if (isNaN(modId)) {
        await ctx.reply("❌ Noto'g'ri ID. Iltimos, raqam kirititing:");
        return true;
      }
      await gameService.addModerator(gameId, modId);
      await ctx.reply(`✅ Moderator (ID: ${modId}) muvaffaqiyatli qo'shildi!`, {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Moderatorlar', `game:moderators:${gameId}`)]]),
      });
      session.waitingEdit = false;
      ctx.session = session;
      return true;
    } else {
      updates[field] = newValue;
    }


    await gameService.updateGame(gameId, updates);

    session.waitingEdit = false;
    ctx.session = session;

    await ctx.reply(`✅ O'yin <b>${field}</b> ma'lumoti muvaffaqiyatli yangilandi!`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Sozlamalar', `game:settings:${gameId}`)]]),
    });
  } catch (err) {
    console.error('Update game error:', err.message);
    await ctx.reply('❌ Xatolik: ' + err.message);
  }

  return true;
}

module.exports = {
  handleAdminCommand,
  registerAdminCallbacks,
  createGameScene,
  handleAdminInput,
};

