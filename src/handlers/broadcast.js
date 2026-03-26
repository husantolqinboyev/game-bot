const supabase = require('../database/supabase');
const userService = require('../services/userService');
const gameService = require('../services/gameService');
const { Markup } = require('telegraf');

/**
 * Send a broadcast message to a list of chat IDs
 */
async function sendBroadcast(bot, targets, messageData) {
  let sent = 0;
  let failed = 0;

  const { text, mediaType, mediaFileId, caption, buttonText, buttonUrl } = messageData;

  const replyMarkup =
    buttonText && buttonUrl
      ? Markup.inlineKeyboard([[Markup.button.url(buttonText, buttonUrl)]]).reply_markup
      : undefined;

  for (const chatId of targets) {
    try {
      if (mediaType === 'photo') {
        await bot.telegram.sendPhoto(chatId, mediaFileId, {
          caption: caption || text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      } else if (mediaType === 'document') {
        await bot.telegram.sendDocument(chatId, mediaFileId, {
          caption: caption || text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      } else if (mediaType === 'video') {
        await bot.telegram.sendVideo(chatId, mediaFileId, {
          caption: caption || text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      } else {
        await bot.telegram.sendMessage(chatId, text, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
      sent++;
    } catch (err) {
      failed++;
      // If bot is blocked, mark user as banned
      if (err.code === 403) {
        await supabase
          .from('users')
          .update({ is_banned: true })
          .eq('id', chatId);
      }
    }

    // Throttle to avoid Telegram rate limits (30 msgs/sec)
    if (sent % 25 === 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return { sent, failed };
}

/**
 * Process a broadcast based on target type
 */
async function processBroadcast(bot, broadcastData) {
  const { target_type, target_game_id, ...msgData } = broadcastData;

  let targets = [];

  if (target_type === 'users') {
    targets = await userService.getAllUserIds();
  } else if (target_type === 'groups') {
    targets = await userService.getAllGroupIds();
  } else if (target_type === 'game_participants' && target_game_id) {
    const { data } = await supabase
      .from('game_participants')
      .select('user_id')
      .eq('game_id', target_game_id)
      .eq('is_active', true);
    targets = (data || []).map((p) => p.user_id);
  } else if (target_type === 'all') {
    const userIds = await userService.getAllUserIds();
    const groupIds = await userService.getAllGroupIds();
    targets = [...new Set([...userIds, ...groupIds])];
  }

  const result = await sendBroadcast(bot, targets, msgData);
  return result;
}

/**
 * Handle incoming message for broadcast from session
 */
async function handleBroadcastMessage(ctx, bot) {
  const session = ctx.session || {};

  // Admin broadcast - step 1: collect message
  if (session.waitingBroadcastMessage && ctx.isAdmin) {
    const msgData = extractMessageData(ctx);
    if (!msgData) return;

    session.broadcastMessageData = msgData;
    session.waitingBroadcastMessage = false;
    session.waitingBroadcastButton = true;
    ctx.session = session;

    await ctx.reply(
      '🔗 <b>Tugma qo\'shish</b>\n\n' +
        'Tugma uchun format:\n' +
        '<code>matn|url</code>\n\n' +
        'Masalan: <code>Saytga o\'tish|https://example.com</code>\n\n' +
        '<i>Tugmasiz xabar yuborish uchun /skip yozing</i>',
      { parse_mode: 'HTML', ...require('../utils/keyboards').cancelMenu() }
    );
    return true;
  }

  // Admin broadcast - step 2: collect button data
  if (session.waitingBroadcastButton && ctx.isAdmin) {
    const text = ctx.message?.text?.trim();
    
    if (text === '/skip') {
      session.broadcastMessageData.buttonText = null;
      session.broadcastMessageData.buttonUrl = null;
    } else {
      const parts = text.split('|');
      if (parts.length === 2) {
        session.broadcastMessageData.buttonText = parts[0].trim();
        session.broadcastMessageData.buttonUrl = parts[1].trim();
      } else {
        await ctx.reply('❌ Noto\'g\'ri format. Iltimos, quyidagicha kiriting:\n\n<code>matn|url</code>\n\nMasalan: <code>Saytga o\'tish|https://example.com</code>');
        return true;
      }
    }

    session.waitingBroadcastButton = false;
    session.waitingBroadcast = true;
    ctx.session = session;

    await ctx.reply('📤 Xabar yuborilmoqda...');

    const result = await processBroadcast(bot, {
      target_type: session.broadcastTarget,
      target_game_id: session.broadcastGameId,
      ...session.broadcastMessageData,
    });

    await ctx.reply(
      `✅ <b>Xabar yuborildi!</b>\n\n` +
        `📤 Muvaffaqiyatli: <b>${result.sent}</b>\n` +
        `❌ Xatolik: <b>${result.failed}</b>`,
      { parse_mode: 'HTML' }
    );
    
    // Clear session data
    session.broadcastMessageData = null;
    session.waitingBroadcast = false;
    ctx.session = session;
    return true;
  }

  
  // Moderator broadcast - step 1: collect message
  if (session.waitingModBroadcastMessage && (ctx.isModerator || ctx.isAdmin)) {
    const msgData = extractMessageData(ctx);
    if (!msgData) return;

    // Verify moderator is moderator of this specific game
    const gameId = session.modBroadcastGameId;
    const isGameModerator = await gameService.isModerator(gameId, ctx.from.id);
    if (!isGameModerator && !ctx.isAdmin) {
      await ctx.reply('⛔ Siz faqat o\'z guruhlaringizga xabar yubora olasiz!');
      session.waitingModBroadcastMessage = false;
      ctx.session = session;
      return true;
    }

    session.modBroadcastMessageData = msgData;
    session.waitingModBroadcastMessage = false;
    session.waitingModBroadcastButton = true;
    ctx.session = session;

    await ctx.reply(
      '🔗 <b>Tugma qo\'shish</b>\n\n' +
        'Tugma uchun format:\n' +
        '<code>matn|url</code>\n\n' +
        'Masalan: <code>Saytga o\'tish|https://example.com</code>\n\n' +
        '<i>Tugmasiz xabar yuborish uchun /skip yozing</i>',
      { parse_mode: 'HTML', ...require('../utils/keyboards').cancelMenu() }
    );
    return true;
  }

  // Moderator broadcast - step 2: collect button data
  if (session.waitingModBroadcastButton && (ctx.isModerator || ctx.isAdmin)) {
    const text = ctx.message?.text?.trim();
    const gameId = session.modBroadcastGameId;
    
    // Verify moderator is moderator of this specific game
    const isGameModerator = await gameService.isModerator(gameId, ctx.from.id);
    if (!isGameModerator && !ctx.isAdmin) {
      await ctx.reply('⛔ Siz faqat o\'z guruhlaringizga xabar yubora olasiz!');
      session.waitingModBroadcastButton = false;
      ctx.session = session;
      return true;
    }
    
    if (text === '/skip') {
      session.modBroadcastMessageData.buttonText = null;
      session.modBroadcastMessageData.buttonUrl = null;
    } else {
      const parts = text.split('|');
      if (parts.length === 2) {
        session.modBroadcastMessageData.buttonText = parts[0].trim();
        session.modBroadcastMessageData.buttonUrl = parts[1].trim();
      } else {
        await ctx.reply('❌ Noto\'g\'ri format. Iltimos, quyidagicha kiriting:\n\n<code>matn|url</code>\n\nMasalan: <code>Saytga o\'tish|https://example.com</code>');
        return true;
      }
    }

    session.waitingModBroadcastButton = false;
    session.modBroadcast = true;
    ctx.session = session;

    const game = await gameService.getGameById(gameId);
    if (!game) return;

    await ctx.reply('📤 Xabar yuborilmoqda...');

    try {
      const replyMarkup = session.modBroadcastMessageData.buttonText && session.modBroadcastMessageData.buttonUrl
        ? Markup.inlineKeyboard([[Markup.button.url(session.modBroadcastMessageData.buttonText, session.modBroadcastMessageData.buttonUrl)]]).reply_markup
        : undefined;

      if (session.modBroadcastMessageData.mediaType === 'photo') {
        await bot.telegram.sendPhoto(game.group_id, session.modBroadcastMessageData.mediaFileId, {
          caption: session.modBroadcastMessageData.caption || session.modBroadcastMessageData.text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      } else if (session.modBroadcastMessageData.mediaType === 'document') {
        await bot.telegram.sendDocument(game.group_id, session.modBroadcastMessageData.mediaFileId, {
          caption: session.modBroadcastMessageData.caption || session.modBroadcastMessageData.text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      } else if (session.modBroadcastMessageData.mediaType === 'video') {
        await bot.telegram.sendVideo(game.group_id, session.modBroadcastMessageData.mediaFileId, {
          caption: session.modBroadcastMessageData.caption || session.modBroadcastMessageData.text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      } else {
        await bot.telegram.sendMessage(game.group_id, session.modBroadcastMessageData.text, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
      await ctx.reply('✅ Xabar guruhga yuborildi!');
    } catch (err) {
      await ctx.reply('❌ Xatolik: ' + err.message);
    }
    
    // Clear session data
    session.modBroadcastMessageData = null;
    session.modBroadcast = false;
    ctx.session = session;
    return true;
  }

  return false;
}

/**
 * Extract message data from context
 */
function extractMessageData(ctx) {
  if (ctx.message?.photo) {
    return {
      mediaType: 'photo',
      mediaFileId: ctx.message.photo[ctx.message.photo.length - 1].file_id,
      caption: ctx.message.caption,
      text: ctx.message.caption,
    };
  } else if (ctx.message?.document) {
    return {
      mediaType: 'document',
      mediaFileId: ctx.message.document.file_id,
      caption: ctx.message.caption,
      text: ctx.message.caption,
    };
  } else if (ctx.message?.video) {
    return {
      mediaType: 'video',
      mediaFileId: ctx.message.video.file_id,
      caption: ctx.message.caption,
      text: ctx.message.caption,
    };
  } else if (ctx.message?.text) {
    return {
      mediaType: null,
      text: ctx.message.text,
    };
  }
  return null;
}

module.exports = { processBroadcast, handleBroadcastMessage };
