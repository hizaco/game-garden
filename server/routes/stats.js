const express = require('express');
const { authMiddleware } = require('../auth');
const { getStats } = require('../db/memory');

const router = express.Router();

// GET /api/users/me/stats
router.get('/me/stats', authMiddleware, (req, res) => {
  const s = getStats(req.user.id);
  const total = s.totalGames || 0;
  const wr = total > 0 ? s.wins / total : 0;
  res.json({ ...s, winRate: wr, nextLevelXp: s.level * 100 });
});

module.exports = { statsRouter: router };
