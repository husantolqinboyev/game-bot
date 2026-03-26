const userService = require('../services/userService');

/**
 * Save every user to DB on each interaction
 */
const saveUser = async (ctx, next) => {
  if (ctx.from) {
    try {
      await userService.upsertUser(ctx.from);
    } catch (err) {
      console.error('saveUser error:', err.message);
    }
  }
  return next();
};

/**
 * Attach role flags to context
 */
const attachRole = async (ctx, next) => {
  if (!ctx.from) return next();

  try {
    ctx.isAdmin = await userService.isAdmin(ctx.from.id);
    ctx.isModerator = await userService.isModerator(ctx.from.id);
  } catch (err) {
    ctx.isAdmin = false;
    ctx.isModerator = false;
  }

  return next();
};

/**
 * Restrict access to admins only
 */
const requireAdmin = async (ctx, next) => {
  if (!ctx.isAdmin) {
    await ctx.answerCbQuery?.('⛔ Ruxsat yo\'q!', { show_alert: true });
    return;
  }
  return next();
};

/**
 * Restrict access to moderators or admins
 */
const requireMod = async (ctx, next) => {
  if (!ctx.isAdmin && !ctx.isModerator) {
    await ctx.answerCbQuery?.('⛔ Ruxsat yo\'q!', { show_alert: true });
    return;
  }
  return next();
};

/**
 * Save group to DB when bot is added
 */
const saveGroup = async (ctx, next) => {
  if (ctx.chat && ['group', 'supergroup'].includes(ctx.chat.type)) {
    try {
      await userService.upsertGroup(ctx.chat);
    } catch (err) {
      console.error('saveGroup error:', err.message);
    }
  }
  return next();
};

module.exports = { saveUser, attachRole, requireAdmin, requireMod, saveGroup };
