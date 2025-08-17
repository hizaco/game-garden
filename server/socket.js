const { Server } = require('socket.io');
const { createLaserGame, applyMirror, rotateMirror, fireLaser } = require('./vgame/laserGame');
const { makeAI } = require('./vgame/laserAI');
const { updateStatsOnGameEnd } = require('./db/memory');

// Simple matchmaker
const waiting = [];

function initSockets(server) {
  const io = new Server(server, {
    cors: { origin: '*'},
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    socket.user = { id: token, username: `user_${token.slice(0,6)}` };
    next();
  });

  io.on('connection', (socket) => {
    socket.on('join-game', (payload = {}) => {
      const mode = payload.mode || 'multiplayer';
      const difficulty = payload.difficulty || 'medium';

      if (mode === 'solo') {
        // Create game with AI
        const game = createLaserGame(socket.user, { id: 'AI', username: `AI_${difficulty}` });
        const room = `solo_${socket.id}`;
        socket.join(room);
        socket.data.game = game;
        socket.data.room = room;
        socket.data.mode = 'solo';
        socket.emit('game-start', { mode: 'solo', gameId: room, gameState: game.stateFor(socket.user.id) });

        // AI turn when needed
        turnLoop(io, socket, game, difficulty);
        return;
      }

      // Multiplayer
      waiting.push(socket);
      socket.emit('waiting-for-opponent', { queuePosition: waiting.length });

      matchPlayers(io);
    });

    socket.on('place-mirror', ({ x, y, orientation }) => {
      const game = socket.data?.game;
      if (!game) return;
      const res = applyMirror(game, socket.user.id, x, y, orientation);
      if (!res.ok) return socket.emit('error-msg', { message: res.message });
      io.to(socket.data.room).emit('mirror-updated', { x, y, orientation, owner: socket.user.id, gameState: game.stateFor() });
      nextTurn(io, socket, game);
    });

    socket.on('rotate-mirror', ({ x, y }) => {
      const game = socket.data?.game;
      if (!game) return;
      const res = rotateMirror(game, socket.user.id, x, y);
      if (!res.ok) return socket.emit('error-msg', { message: res.message });
      io.to(socket.data.room).emit('mirror-updated', { x, y, orientation: res.orientation, owner: socket.user.id, gameState: game.stateFor() });
      nextTurn(io, socket, game);
    });

    socket.on('fire-laser', () => {
      const game = socket.data?.game;
      if (!game) return;
      const result = fireLaser(game, socket.user.id);
      io.to(socket.data.room).emit('laser-path', { path: result.path, hit: result.hit, gameState: game.stateFor() });
      if (result.scored || result.gameEnded) {
        io.to(socket.data.room).emit('score-updated', { scores: game.scores, remainingTargets: game.targets.length });
      }
      if (result.gameEnded) {
        endGame(io, socket, game, result.winnerId, result.reason);
      } else {
        nextTurn(io, socket, game);
      }
    });

    socket.on('disconnect', () => {
      // Cleanup if necessary
    });
  });
}

function matchPlayers(io) {
  while (waiting.length >= 2) {
    const a = waiting.shift();
    const b = waiting.shift();
    if (!a.connected || !b.connected) continue;

    const game = createLaserGame(a.user, b.user);
    const room = `mp_${a.id}_${b.id}`;
    a.join(room);
    b.join(room);
    a.data.game = game;
    b.data.game = game;
    a.data.room = room;
    b.data.room = room;
    a.data.mode = 'multiplayer';
    b.data.mode = 'multiplayer';

    a.emit('game-start', { mode: 'multiplayer', gameId: room, gameState: game.stateFor(a.user.id) });
    b.emit('game-start', { mode: 'multiplayer', gameId: room, gameState: game.stateFor(b.user.id) });
  }
}

function nextTurn(io, socket, game) {
  game.nextTurn();
  io.to(socket.data.room).emit('turn-changed', { gameState: game.stateFor() });
  if (socket.data.mode === 'solo') {
    turnLoop(io, socket, game, 'medium');
  }
}

function turnLoop(io, socket, game, difficulty) {
  const current = game.currentPlayer();
  if (current?.id === 'AI') {
    const ai = makeAI(difficulty);
    const move = ai.choose(game);
    setTimeout(() => {
      if (move.type === 'place') {
        const res = applyMirror(game, 'AI', move.x, move.y, move.orientation);
        if (res.ok) io.to(socket.data.room).emit('mirror-updated', { x: move.x, y: move.y, orientation: move.orientation, owner: 'AI', gameState: game.stateFor() });
      } else if (move.type === 'rotate') {
        const res = rotateMirror(game, 'AI', move.x, move.y);
        if (res.ok) io.to(socket.data.room).emit('mirror-updated', { x: move.x, y: move.y, orientation: res.orientation, owner: 'AI', gameState: game.stateFor() });
      }
      const result = fireLaser(game, 'AI');
      io.to(socket.data.room).emit('laser-path', { path: result.path, hit: result.hit, gameState: game.stateFor() });
      if (result.scored || result.gameEnded) {
        io.to(socket.data.room).emit('score-updated', { scores: game.scores, remainingTargets: game.targets.length });
      }
      if (result.gameEnded) {
        endGame(io, socket, game, result.winnerId, result.reason);
      } else {
        nextTurn(io, socket, game);
      }
    }, 700);
  }
}

function endGame(io, socket, game, winnerId, reason) {
  io.to(socket.data.room).emit('game-end', { winner: winnerId, reason, scores: game.scores });
  // Update stats for human players
  for (const p of game.players) {
    if (p.id === 'AI') continue;
    const result = p.id === winnerId ? 'win' : 'loss';
    updateStatsOnGameEnd(p.id, result, 'medium');
  }
}

module.exports = { initSockets };
