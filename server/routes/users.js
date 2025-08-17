const express = require('express');
const { authMiddleware } = require('../auth');
const { getUser, saveUser } = require('../db/memory');

const router = express.Router();

// GET /api/users/me
router.get('/me', authMiddleware, (req, res) => {
  const u = getUser(req.user.id, req.user.username);
  res.json(u);
});

// PATCH /api/users/me
router.patch('/me', authMiddleware, (req, res) => {
  const u = getUser(req.user.id, req.user.username);
  const { username, displayName, avatar, bio } = req.body || {};
  if (typeof username === 'string' && username.trim().length >= 3) u.username = username.trim();
  if (typeof displayName === 'string') u.displayName = displayName.trim();
  if (typeof avatar === 'string') u.avatar = avatar.trim();
  if (typeof bio === 'string') u.bio = bio.trim().slice(0, 500);
  saveUser(u);
  res.json(u);
});

module.exports = { usersRouter: router };
