// Simple in-memory stores for demo
const users = new Map(); // id -> {id, username, displayName, avatar, bio}
const stats = new Map(); // id -> {totalGames, wins, losses, currentStreak, bestStreak, xp, level, coins, lastPlayedAt}

function getUser(id, usernameFallback) {
  if (!users.has(id)) {
    users.set(id, { id, username: usernameFallback || `user_${id.slice(0,6)}`, displayName: '', avatar: '', bio: '' });
  }
  return users.get(id);
}

function saveUser(u) {
  users.set(u.id, u);
  return u;
}

function getStats(id) {
  if (!stats.has(id)) {
    stats.set(id, { totalGames: 0, wins: 0, losses: 0, currentStreak: 0, bestStreak: 0, xp: 0, level: 1, coins: 0, lastPlayedAt: null });
  }
  return stats.get(id);
}

function updateStatsOnGameEnd(id, result = 'loss', difficulty = 'medium') {
  const s = getStats(id);
  s.totalGames += 1;
  const diffBonus = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
  if (result === 'win') {
    s.wins += 1;
    s.currentStreak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.currentStreak);
    s.xp += 50 * diffBonus;
    s.coins += 10 * diffBonus;
  } else {
    s.losses += 1;
    s.currentStreak = 0;
    s.xp += 15;
    s.coins += 3;
  }
  while (s.xp >= (s.level * 100)) {
    s.xp -= (s.level * 100);
    s.level += 1;
  }
  s.lastPlayedAt = new Date().toISOString();
  return s;
}

module.exports = { getUser, saveUser, getStats, updateStatsOnGameEnd };
