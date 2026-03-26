const supabase = require('../database/supabase');

/**
 * Save or update user in DB
 */
async function upsertUser(telegramUser) {
  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        id: telegramUser.id,
        username: telegramUser.username || null,
        first_name: telegramUser.first_name || null,
        last_name: telegramUser.last_name || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get user by ID
 */
async function getUserById(userId) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

/**
 * Get user by username
 */
async function getUserByUsername(username) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('username', username.replace('@', ''))
    .maybeSingle();
  return data;
}

/**
 * Set admin status
 */
async function setAdmin(userId, isAdmin) {
  const { data, error } = await supabase
    .from('users')
    .update({ is_admin: isAdmin })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Check if user is admin
 */
async function isAdmin(userId) {
  const adminIds = (process.env.ADMIN_IDS || '')
    .split(',')
    .map((id) => parseInt(id.trim()))
    .filter(Boolean);

  if (adminIds.includes(userId)) return true;

  const { data } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();

  return data?.is_admin || false;
}

/**
 * Check if user is moderator of any ACTIVE game
 */
async function isModerator(userId) {
  const { data } = await supabase
    .from('game_moderators')
    .select('game_id, games!inner(is_active)')
    .eq('user_id', userId)
    .eq('games.is_active', true)
    .limit(1);
  return (data || []).length > 0;
}

/**
 * Save/update group in DB
 */
async function upsertGroup(chat) {
  const { data, error } = await supabase
    .from('groups')
    .upsert(
      {
        id: chat.id,
        title: chat.title,
        username: chat.username || null,
      },
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get all groups
 */
async function getAllGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('is_active', true)
    .order('added_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Get global statistics
 */
async function getGlobalStats() {
  const [
    { count: groups },
    { count: activeGames },
    { count: users },
    { count: numbers },
  ] = await Promise.all([
    supabase.from('groups').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('games').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('game_numbers').select('*', { count: 'exact', head: true }),
  ]);

  return {
    groups: groups || 0,
    activeGames: activeGames || 0,
    users: users || 0,
    numbers: numbers || 0,
  };
}

/**
 * Get all user IDs (for broadcast)
 */
async function getAllUserIds() {
  const { data } = await supabase.from('users').select('id').eq('is_banned', false);
  return (data || []).map((u) => u.id);
}

/**
 * Get all group IDs (for broadcast)
 */
async function getAllGroupIds() {
  const { data } = await supabase.from('groups').select('id').eq('is_active', true);
  return (data || []).map((g) => g.id);
}

/**
 * Log member join/leave for anti-cheat
 */
async function logMemberAction(groupId, userId, gameId, action) {
  await supabase.from('member_logs').insert({
    group_id: groupId,
    user_id: userId,
    game_id: gameId,
    action,
  });
}

/**
 * Check if user has left and rejoined (anti-cheat)
 */
async function checkLeaveRejoin(groupId, userId, gameStartDate) {
  const { data } = await supabase
    .from('member_logs')
    .select('action, logged_at')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .gte('logged_at', gameStartDate)
    .order('logged_at', { ascending: true });

  if (!data || data.length < 2) return false;

  const hasLeft = data.some((log) => log.action === 'leave');
  const hasJoinedAfterLeave = data.some((log, i) => {
    if (log.action !== 'join') return false;
    const leftBefore = data.slice(0, i).some((l) => l.action === 'leave');
    return leftBefore;
  });

  return hasLeft && hasJoinedAfterLeave;
}

module.exports = {
  upsertUser,
  getUserById,
  getUserByUsername,
  setAdmin,
  isAdmin,
  isModerator,
  upsertGroup,
  getAllGroups,
  getGlobalStats,
  getAllUserIds,
  getAllGroupIds,
  logMemberAction,
  checkLeaveRejoin,
};
