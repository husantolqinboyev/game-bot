const supabase = require('../database/supabase');

// =====================================================
// GAME SERVICE
// =====================================================

/**
 * Create a new game
 */
async function createGame({ groupId, title, conditions, peoplePerNumber, endDate, createdBy }) {
  const { data, error } = await supabase
    .from('games')
    .insert({
      group_id: groupId,
      title,
      conditions,
      people_per_number: peoplePerNumber || 5,
      end_date: endDate || null,
      created_by: createdBy,
    })
    .select('*, groups(*)')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get active game for a group
 */
async function getActiveGameForGroup(groupId) {
  const { data, error } = await supabase
    .from('games')
    .select('*, groups(*)')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Get all active games
 */
async function getAllActiveGames() {
  const { data, error } = await supabase
    .from('games')
    .select(`
      *,
      groups(*),
      game_participants(count),
      game_numbers(count)
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get game by ID
 */
async function getGameById(gameId) {
  const { data, error } = await supabase
    .from('games')
    .select('*, groups(*)')
    .eq('id', gameId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update game settings
 */
async function updateGame(gameId, updates) {
  const { data, error } = await supabase
    .from('games')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', gameId)
    .select('*, groups(*)')
    .single();

  if (error) throw error;
  return data;
}

/**
 * End a game
 */
async function endGame(gameId) {
  const { data, error } = await supabase
    .from('games')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', gameId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Add moderator to game
 */
async function addModerator(gameId, userId) {
  const { data, error } = await supabase
    .from('game_moderators')
    .upsert({ game_id: gameId, user_id: userId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get ACTIVE games moderated by user
 */
async function getModeratorGames(userId) {
  const { data, error } = await supabase
    .from('game_moderators')
    .select('game_id, games!inner(*, groups(*))')
    .eq('user_id', userId)
    .eq('games.is_active', true);

  if (error) throw error;
  return (data || []).map((m) => m.games).filter(Boolean);
}

/**
 * Get ACTIVE games where user is a participant
 */
async function getUserGames(userId) {
  const { data, error } = await supabase
    .from('game_participants')
    .select('game_id, games!inner(*, groups(*))')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('games.is_active', true);

  if (error) throw error;
  return (data || []).map((p) => p.games).filter(Boolean);
}

/**
 * Get all moderators for a game
 */
async function getGameModerators(gameId) {
  const { data, error } = await supabase
    .from('game_moderators')
    .select('user_id, added_at, users(*)')
    .eq('game_id', gameId);
  if (error) throw error;
  return data || [];
}

/**
 * Remove moderator from game
 */
async function removeModerator(gameId, userId) {
  const { error } = await supabase
    .from('game_moderators')
    .delete()
    .eq('game_id', gameId)
    .eq('user_id', userId);
  if (error) throw error;
  return true;
}

/**
 * Check if user is moderator for a game
 */
async function isModerator(gameId, userId) {
  const { data } = await supabase
    .from('game_moderators')
    .select('game_id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle();

  return !!data;
}


// =====================================================
// PARTICIPANT SERVICE
// =====================================================

/**
 * Get ACTIVE games created by user
 */
async function getCreatedGames(userId) {
  const { data, error } = await supabase
    .from('games')
    .select('*, groups(*)')
    .eq('created_by', userId)
    .eq('is_active', true);

  if (error) throw error;
  return data || [];
}

/**
 * Get or create participant in a game
 */
async function getOrCreateParticipant(gameId, userId, invitedBy = null) {
  // Check if already exists
  let { data: existing } = await supabase
    .from('game_participants')
    .select('*')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    let updatedParticipant = existing;
    let justInvited = false;

    // Update inviter if missing
    if (invitedBy && !existing.invited_by && existing.user_id !== invitedBy) {
      const { data: updated } = await supabase
        .from('game_participants')
        .update({ invited_by: invitedBy })
        .eq('id', existing.id)
        .select()
        .single();
      updatedParticipant = updated;
      justInvited = true;
    }

    // Reactivate if was inactive
    if (!existing.is_active) {
      const { data: reactivated } = await supabase
        .from('game_participants')
        .update({ is_active: true, left_at: null, invited_by: invitedBy || existing.invited_by })
        .eq('id', existing.id)
        .select()
        .single();
      return { participant: reactivated, isNew: false, wasRejoined: true, justInvited };
    }
    return { participant: updatedParticipant, isNew: false, wasRejoined: false, justInvited };
  }


  // Create new participant
  const { data, error } = await supabase
    .from('game_participants')
    .insert({
      game_id: gameId,
      user_id: userId,
      invited_by: invitedBy,
      invite_count: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return { participant: data, isNew: true, wasRejoined: false };
}

/**
 * Get or create a unique group invite link for a participant
 */
async function getOrCreateUniqueInviteLink(gameId, userId, groupId, bot) {
  const { data: participant } = await supabase
    .from('game_participants')
    .select('unique_invite_link')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle();

  if (participant?.unique_invite_link) return participant.unique_invite_link;

  try {
    const invite = await bot.telegram.createChatInviteLink(groupId, {
      name: `User_${userId}_Game_${gameId.split('-')[0]}`,
    });

    const link = invite.invite_link;
    await supabase
      .from('game_participants')
      .update({ unique_invite_link: link })
      .eq('game_id', gameId)
      .eq('user_id', userId);

    return link;
  } catch (err) {
    console.error('CreateInviteLink error:', err.message);
    return null;
  }
}

/**
 * Find inviter by unique invite link string
 */
async function findInviterByInviteLink(gameId, link) {
  const { data } = await supabase
    .from('game_participants')
    .select('user_id')
    .eq('game_id', gameId)
    .eq('unique_invite_link', link)
    .maybeSingle();

  return data?.user_id;
}


/**
 * Increment invite count and check for number assignment
 */
async function processNewInvite(gameId, inviterId) {
  // Increment inviter's count
  const { data: participant, error: fetchError } = await supabase
    .from('game_participants')
    .select('*')
    .eq('game_id', gameId)
    .eq('user_id', inviterId)
    .single();

  if (fetchError || !participant) return null;

  const newCount = participant.invite_count + 1;

  const { data: updated, error } = await supabase
    .from('game_participants')
    .update({ invite_count: newCount })
    .eq('id', participant.id)
    .select()
    .single();

  if (error) throw error;

  // Get game config
  const game = await getGameById(gameId);
  if (!game) return { updated, numberAssigned: null };

  // Check if a new number should be assigned
  const previousNumbers = Math.floor(participant.invite_count / game.people_per_number);
  const newNumbers = Math.floor(newCount / game.people_per_number);

  let numberAssigned = null;
  if (newNumbers > previousNumbers) {
    // Assign number using DB function
    const { data: numberData, error: numError } = await supabase
      .rpc('assign_number_to_user', {
        p_game_id: gameId,
        p_user_id: inviterId,
      });

    if (!numError) {
      numberAssigned = numberData;
    }
  }

  return { updated, numberAssigned, game };
}

/**
 * Decrement invite count when someone leaves (anti-cheat)
 */
async function processUserLeft(gameId, userId, invitedBy) {
  if (!invitedBy) return null;

  // Mark user as inactive
  await supabase
    .from('game_participants')
    .update({ is_active: false, left_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('user_id', userId);

  // Decrement inviter's count
  const { data: inviterParticipant } = await supabase
    .from('game_participants')
    .select('*')
    .eq('game_id', gameId)
    .eq('user_id', invitedBy)
    .maybeSingle();

  if (!inviterParticipant || inviterParticipant.invite_count <= 0) return inviterParticipant;

  const { data: updated } = await supabase
    .from('game_participants')
    .update({ invite_count: inviterParticipant.invite_count - 1 })
    .eq('id', inviterParticipant.id)
    .select()
    .single();

  return updated;
}

/**
 * Get participant details with number count
 */
async function getParticipantDetails(gameId, userId) {
  const { data: participant } = await supabase
    .from('game_participants')
    .select('*')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!participant) return null;

  const { count: numberCount } = await supabase
    .from('game_numbers')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('assigned_to', userId);

  return { ...participant, number_count: numberCount || 0 };
}

/**
 * Get user's numbers for a game
 */
async function getUserNumbers(gameId, userId) {
  const { data, error } = await supabase
    .from('game_numbers')
    .select('*')
    .eq('game_id', gameId)
    .eq('assigned_to', userId)
    .order('number', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get leaderboard for a game
 */
async function getLeaderboard(gameId, limit = 10) {
  const { data, error } = await supabase
    .from('game_participants')
    .select(`
      *,
      users!user_id(id, first_name, last_name, username)
    `)
    .eq('game_id', gameId)
    .eq('is_active', true)
    .order('invite_count', { ascending: false })
    .limit(limit);

  if (error) throw error;

  // Enrich with number counts
  const enriched = await Promise.all(
    (data || []).map(async (p) => {
      const { count } = await supabase
        .from('game_numbers')
        .select('*', { count: 'exact', head: true })
        .eq('game_id', gameId)
        .eq('assigned_to', p.user_id);
      return { ...p, number_count: count || 0 };
    })
  );

  return enriched;
}

/**
 * Get user's rank in a game
 */
async function getUserRank(gameId, userId) {
  const { data } = await supabase
    .from('game_participants')
    .select('user_id, invite_count')
    .eq('game_id', gameId)
    .eq('is_active', true)
    .order('invite_count', { ascending: false });

  if (!data) return { rank: '-', total: 0 };

  const rank = data.findIndex((p) => p.user_id === userId) + 1;
  return { rank: rank || '-', total: data.length };
}

/**
 * Transfer number to another user
 */
async function transferNumber(gameId, fromUserId, toUserId, number) {
  const { data, error } = await supabase
    .from('game_numbers')
    .update({ assigned_to: toUserId })
    .eq('game_id', gameId)
    .eq('number', number)
    .eq('assigned_to', fromUserId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get game stats
 */
async function getGameStats(gameId) {
  const [
    { count: participants },
    { count: numbers },
    { count: totalJoins },
    { count: leaves },
  ] = await Promise.all([
    supabase
      .from('game_participants')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('is_active', true),
    supabase
      .from('game_numbers')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameId),
    supabase
      .from('member_logs')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('action', 'join'),
    supabase
      .from('member_logs')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('action', 'leave'),
  ]);

  return {
    participants: participants || 0,
    numbers: numbers || 0,
    totalJoins: totalJoins || 0,
    leaves: leaves || 0,
  };
}

/**
 * Get full data for export
 */
async function getGameExportData(gameId) {
  const { data: participants, error: pError } = await supabase
    .from('game_participants')
    .select(`
      id, user_id, invite_count, is_active, disqualified, joined_at,
      users!user_id(first_name, last_name, username)
    `)
    .eq('game_id', gameId)
    .order('invite_count', { ascending: false });

  if (pError) throw pError;

  const { data: numbers, error: nError } = await supabase
    .from('game_numbers')
    .select('*')
    .eq('game_id', gameId);

  if (nError) throw nError;

  // Combine
  return participants.map((p) => {
    const userNumbers = numbers
      .filter((n) => n.assigned_to === p.user_id)
      .map((n) => n.number);

    return {
      user_id: p.user_id,
      name: [p.users?.first_name, p.users?.last_name].filter(Boolean).join(' '),
      username: p.users?.username || '',
      invites: p.invite_count,
      numbers: userNumbers,
      is_active: p.is_active,
      disqualified: p.disqualified || false,
      joined_at: p.joined_at,
    };
  });
}

module.exports = {
  createGame,
  getActiveGameForGroup,
  getAllActiveGames,
  getGameById,
  updateGame,
  endGame,
  addModerator,
  getModeratorGames,
  getUserGames,
  getCreatedGames,
  isModerator,
  getOrCreateParticipant,
  processNewInvite,
  processUserLeft,
  getParticipantDetails,
  getUserNumbers,
  getLeaderboard,
  getUserRank,
  transferNumber,
  getGameStats,
  getGameExportData,
  getGameModerators,
  removeModerator,
  getOrCreateUniqueInviteLink,
  findInviterByInviteLink,
};



