// =====================================================
// MESSAGE TEMPLATES
// =====================================================

const userName = (u) => {
  if (!u) return 'Noma\'lum';
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ');
  return u.username ? `${name} (@${u.username})` : name;
};

const formatDate = (d) => {
  if (!d) return 'Cheksiz';
  const date = new Date(d);
  return date.toLocaleString('uz-UZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const timeLeft = (endDate) => {
  if (!endDate) return '♾ Cheksiz';
  const diff = new Date(endDate) - new Date();
  if (diff <= 0) return '⏰ Tugagan';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days} kun ${hours} soat`;
  if (hours > 0) return `${hours} soat ${mins} daqiqa`;
  return `${mins} daqiqa`;
};

// =====================================================
// ADMIN MESSAGES
// =====================================================
const msgs = {
  adminWelcome: (stats) =>
    `🛠 <b>Admin Paneli</b>\n\n` +
    `📊 <b>Umumiy statistika:</b>\n` +
    `• 🏘 Guruhlar: <b>${stats.groups}</b>\n` +
    `• 🎮 Faol o'yinlar: <b>${stats.activeGames}</b>\n` +
    `• 👥 Foydalanuvchilar: <b>${stats.users}</b>\n` +
    `• 🔢 Berilgan raqamlar: <b>${stats.numbers}</b>`,

  gameList: (games) => {
    if (!games.length) return '❌ Hech qanday o\'yin topilmadi.';
    return (
      `🎮 <b>Faol o'yinlar:</b>\n\n` +
      games
        .map(
          (g, i) =>
            `${i + 1}. <b>${g.title}</b>\n` +
            `   🏘 ${g.groups?.title || 'Guruh'}\n` +
            `   ⏱ ${timeLeft(g.end_date)}\n` +
            `   👥 Ishtirokchilar: <b>${g.participant_count || 0}</b>`
        )
        .join('\n\n')
    );
  },

  gameCreated: (game, group) =>
    `✅ <b>O'yin yaratildi!</b>\n\n` +
    `🎮 <b>${game.title}</b>\n` +
    `🏘 Guruh: <b>${group.title}</b>\n` +
    `📋 Shart: Har <b>${game.people_per_number}</b> ta odam = 1 ta raqam\n` +
    `⏱ Muddat: <b>${timeLeft(game.end_date)}</b>\n` +
    `🆔 ID: <code>${game.id}</code>`,

  gameStats: (game, stats) =>
    `📊 <b>O'yin statistikasi</b>\n\n` +
    `🎮 <b>${game.title}</b>\n` +
    `🏘 Guruh: ${game.groups?.title}\n` +
    `──────────────\n` +
    `👥 Ishtirokchilar: <b>${stats.participants}</b>\n` +
    `🔢 Berilgan raqamlar: <b>${stats.numbers}</b>\n` +
    `📥 Jami qo'shilganlar: <b>${stats.totalJoins}</b>\n` +
    `📤 Chiqib ketganlar: <b>${stats.leaves}</b>\n` +
    `⏱ Qolgan vaqt: <b>${timeLeft(game.end_date)}</b>`,

  broadcastMenu: () =>
    `📢 <b>Xabarnoma yuborish</b>\n\nKimga xabar yubormoqchisiz?`,

  // =====================================================
  // MODERATOR MESSAGES
  // =====================================================
  modWelcome: (name) =>
    `👔 <b>Moderator paneli</b>\n\nXush kelibsiz, <b>${name}</b>!\nSiz nazoratchisiz.`,

  // =====================================================
  // USER MESSAGES
  // =====================================================
  userWelcome: (user, game, participant) =>
    `🎉 <b>O'yinga xush kelibsiz!</b>\n\n` +
    `👤 <b>${userName(user)}</b>\n` +
    `🎮 O'yin: <b>${game.title}</b>\n` +
    `🏘 Guruh: <b>${game.groups?.title}</b>\n` +
    `──────────────\n` +
    `👥 Taklif qilganlar: <b>${participant?.invite_count || 0}</b>\n` +
    `🔢 Raqamlarim: <b>${participant?.number_count || 0}</b> ta\n` +
    `⏱ Qolgan vaqt: <b>${timeLeft(game.end_date)}</b>`,

  userConditions: (game) =>
    `📜 <b>O'yin shartlari</b>\n\n` +
    `🎮 <b>${game.title}</b>\n\n` +
    `${game.conditions || 'Shartlar belgilanmagan.'}\n\n` +
    `──────────────\n` +
    `📋 Har <b>${game.people_per_number}</b> ta odam uchun <b>1</b> ta unikal raqam beriladi.\n` +
    `📅 Boshlanish: <b>${formatDate(game.start_date)}</b>\n` +
    `⏰ Tugash: <b>${formatDate(game.end_date)}</b>`,

  userNumbers: (numbers) => {
    if (!numbers.length) return `🔢 <b>Raqamlarim</b>\n\nHali raqam yo'q. Ko'proq odam taklif qiling!`;
    return (
      `🔢 <b>Mening raqamlarim</b>\n\n` +
      numbers.map((n) => `🏷 <b>${n.number}-raqam</b> — ${formatDate(n.assigned_at)}`).join('\n')
    );
  },

  userStats: (participant) =>
    `📊 <b>Mening statistikam</b>\n\n` +
    `👥 Taklif qilganlar: <b>${participant.invite_count || 0}</b>\n` +
    `🔢 Raqamlar soni: <b>${participant.number_count || 0}</b>\n` +
    `🏆 O'rnim: <b>--</b> / --`,

  topList: (participants) => {
    if (!participants.length) return '📊 Hali ishtirokchilar yo\'q.';
    const medals = ['🥇', '🥈', '🥉'];
    return (
      `🏆 <b>TOP ishtirokchilar</b>\n\n` +
      participants
        .slice(0, 10)
        .map((p, i) => {
          const medal = medals[i] || `${i + 1}.`;
          const name = p.users
            ? [p.users.first_name, p.users.last_name].filter(Boolean).join(' ')
            : 'Noma\'lum';
          return `${medal} <b>${name}</b> — 👥 ${p.invite_count} kishi | 🔢 ${p.number_count || 0} raqam`;
        })
        .join('\n')
    );
  },

  // =====================================================
  // GROUP / GAME MESSAGES
  // =====================================================
  numberAssigned: (userName, number, inviteCount) =>
    `🎊 <b>TABRIKLAYMIZ!</b> 🎊\n\n` +
    `👤 ${userName}\n` +
    `Siz jami <b>${inviteCount} ta</b> a'zo qo'shib,\n` +
    `🏷 <b>${number}-unikal raqamni</b> qo'lga kiritdingiz!\n\n` +
    `💎 Omad yor bo'lsin!`,

  newMemberJoined: (inviterName, newMemberName, progress, needed) =>
    `🤝 <b>${inviterName}</b> guruhga yangi a'zo qo'shdi!\n\n` +
    `👤 <b>${newMemberName}</b> o'yinga qo'shildi.\n` +
    `📊 Keyingi raqamgacha: <b>${progress}/${needed}</b>`,


  userLeftWarning: (inviterName, leftMemberName) =>
    `⚠️ <b>Diqqat!</b>\n\n` +
    `❌ <b>${leftMemberName}</b> guruhdan chiqib ketdi.\n` +
    `📉 <b>${inviterName}</b> ning hisobidan 1 ta kishi ayirildi.`,

  gameEnded: (title, topParticipants) =>
    `🏁 <b>O'yin tugadi!</b>\n\n` +
    `🎮 <b>${title}</b>\n\n` +
    `🏆 <b>G'oliblar:</b>\n` +
    topParticipants
      .slice(0, 3)
      .map((p, i) => {
        const medals = ['🥇', '🥈', '🥉'];
        const name = p.users
          ? [p.users.first_name, p.users.last_name].filter(Boolean).join(' ')
          : 'Noma\'lum';
        return `${medals[i]} ${name} — ${p.number_count || 0} raqam`;
      })
      .join('\n'),
};

module.exports = { msgs, userName, formatDate, timeLeft };
