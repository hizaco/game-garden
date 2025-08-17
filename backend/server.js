require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Static files
app.use(express.static(path.join(__dirname, '../frontend')));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/battle-dots', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/game', require('./routes/game'));
app.use('/api/user', require('./routes/user'));

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/profile.html'));
});

// Battle Dots Game Management
let activeGames = new Map();
let connectedPlayers = new Map();
let gameQueue = [];

class BattleDots {
  constructor(gameId, players) {
    this.gameId = gameId;
    this.players = players;
    this.grid = this.initializeGrid();
    this.currentPlayer = 0;
    this.turnCount = 0;
    this.gameState = 'playing';
    this.territoryCount = { player1: 0, player2: 0 };
    this.turnTimer = null;
    this.turnTimeLimit = 15000; // 15 secondes
    this.dotsToExpand = new Map(); // Dots en attente d'expansion
  }

  initializeGrid() {
    const grid = [];
    for (let i = 0; i < 10; i++) {
      grid[i] = [];
      for (let j = 0; j < 10; j++) {
        grid[i][j] = {
          owner: null,
          type: 'empty',
          placedTurn: null,
          mature: false
        };
      }
    }

    // Ajouter quelques cases bonus aléatoires
    this.addBonusCells(grid);
    return grid;
  }

  addBonusCells(grid) {
    const bonusCount = 8; // 8 cases bonus sur 100
    const bonusPositions = new Set();

    while (bonusPositions.size < bonusCount) {
      const x = Math.floor(Math.random() * 10);
      const y = Math.floor(Math.random() * 10);
      const pos = `${x},${y}`;

      if (!bonusPositions.has(pos)) {
        bonusPositions.add(pos);
        grid[x][y].type = 'bonus';
        grid[x][y].bonusType = this.getRandomBonusType();
      }
    }
  }

  getRandomBonusType() {
    const types = ['double_placement', 'shield', 'expansion_boost'];
    return types[Math.floor(Math.random() * types.length)];
  }

  isValidPosition(x, y) {
    return x >= 0 && x < 10 && y >= 0 && y < 10;
  }

  getNeighbors(x, y) {
    const neighbors = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // Haut, Bas, Gauche, Droite

    directions.forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (this.isValidPosition(nx, ny)) {
        neighbors.push({ nx, ny });
      }
    });

    return neighbors;
  }

  getEnemyId(playerId) {
    return this.players[0].id === playerId ? this.players[1].id : this.players[0].id;
  }

  // Place a dot and advance the turn. Expansions and win checks are handled OUTSIDE this method.
  placeDot(x, y, playerId) {
    if (this.gameState !== 'playing') {
      return { success: false, message: 'Partie terminée' };
    }

    if (this.players[this.currentPlayer].id !== playerId) {
      return { success: false, message: 'Ce n\'est pas votre tour' };
    }

    if (!this.isValidPosition(x, y)) {
      return { success: false, message: 'Position invalide' };
    }

    if (this.grid[x][y].owner !== null) {
      return { success: false, message: 'Case déjà occupée' };
    }

    // Placer le dot
    this.grid[x][y].owner = playerId;
    this.grid[x][y].placedTurn = this.turnCount;
    this.grid[x][y].mature = false;

    // Gérer les cases bonus
    if (this.grid[x][y].type === 'bonus') {
      this.activateBonus(playerId, this.grid[x][y].bonusType);
      this.grid[x][y].type = 'normal';
    }

    // Programmer l'expansion pour dans 3 tours
    const expandTurn = this.turnCount + 3;
    if (!this.dotsToExpand.has(expandTurn)) {
      this.dotsToExpand.set(expandTurn, []);
    }
    this.dotsToExpand.get(expandTurn).push({ x, y, playerId });

    // Passer au joueur suivant
    this.currentPlayer = (this.currentPlayer + 1) % 2;
    this.turnCount++;

    // Note: pas d'expansion ni de check de victoire ici; ça se fait après.
    return { success: true };
  }

  processExpansions() {
    if (!this.dotsToExpand.has(this.turnCount)) {
      return { expansions: [], captures: [] };
    }

    const expansions = [];
    const captures = [];
    const dotsToExpand = this.dotsToExpand.get(this.turnCount);

    dotsToExpand.forEach(({ x, y, playerId }) => {
      // Marquer le dot comme mature
      if (this.grid[x] && this.grid[x][y] && this.grid[x][y].owner === playerId) {
        this.grid[x][y].mature = true;

        // Expansion vers les cases adjacentes vides
        const neighbors = this.getNeighbors(x, y);
        neighbors.forEach(({ nx, ny }) => {
          if (this.grid[nx][ny].owner === null && this.grid[nx][ny].type !== 'bonus') {
            this.grid[nx][ny].owner = playerId;
            this.grid[nx][ny].placedTurn = this.turnCount;
            this.grid[nx][ny].mature = false;
            expansions.push({ x: nx, y: ny, playerId });

            // Programmer cette expansion pour dans 3 tours
            const expandTurn = this.turnCount + 3;
            if (!this.dotsToExpand.has(expandTurn)) {
              this.dotsToExpand.set(expandTurn, []);
            }
            this.dotsToExpand.get(expandTurn).push({ x: nx, y: ny, playerId });
          }
        });
      }
    });

    // Supprimer les dots expansés de la liste d'attente
    this.dotsToExpand.delete(this.turnCount);

    // Vérifier les captures après expansion
    const allCaptures = this.checkCaptures();
    captures.push(...allCaptures);

    return { expansions, captures };
  }

  checkCaptures() {
    const captures = [];
    const visited = new Set();

    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        const pos = `${i},${j}`;
        if (!visited.has(pos) && this.grid[i][j].owner !== null) {
          const group = this.findConnectedGroup(i, j, this.grid[i][j].owner, visited);

          if (this.isGroupSurrounded(group, this.grid[i][j].owner)) {
            // Ce groupe est entouré, capturer tous ses dots
            group.forEach(({ x, y }) => {
              const enemyId = this.getEnemyId(this.grid[x][y].owner);
              this.grid[x][y].owner = enemyId;
              captures.push({ x, y, newPlayerId: enemyId });
            });
          }
        }
      }
    }

    return captures;
  }

  findConnectedGroup(startX, startY, playerId, visited) {
    const group = [];
    const queue = [{ x: startX, y: startY }];
    const localVisited = new Set();

    while (queue.length > 0) {
      const { x, y } = queue.shift();
      const pos = `${x},${y}`;

      if (localVisited.has(pos) || visited.has(pos)) continue;
      if (!this.isValidPosition(x, y)) continue;
      if (this.grid[x][y].owner !== playerId) continue;

      localVisited.add(pos);
      visited.add(pos);
      group.push({ x, y });

      // Ajouter les voisins à la queue
      const neighbors = this.getNeighbors(x, y);
      neighbors.forEach(({ nx, ny }) => {
        queue.push({ x: nx, y: ny });
      });
    }

    return group;
  }

  isGroupSurrounded(group, playerId) {
    const enemyId = this.getEnemyId(playerId);

    for (const { x, y } of group) {
      const neighbors = this.getNeighbors(x, y);

      for (const { nx, ny } of neighbors) {
        if (!this.isValidPosition(nx, ny)) {
          // Bord de la grille compte comme non-entouré
          return false;
        }

        if (this.grid[nx][ny].owner === null || this.grid[nx][ny].owner === playerId) {
          // Case vide ou alliée = pas entouré
          return false;
        }
      }
    }

    return true; // Complètement entouré par l'ennemi
  }

  activateBonus(playerId, bonusType) {
    // Implémentation basique des bonus
    console.log(`⚡ Bonus ${bonusType} activé pour ${playerId}`);
    // TODO: Implémenter les effets des bonus
  }

  updateTerritoryCount() {
    let player1Count = 0;
    let player2Count = 0;

    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        const owner = this.grid[i][j].owner;
        if (owner === this.players[0].id) {
          player1Count++;
        } else if (owner === this.players[1].id) {
          player2Count++;
        }
      }
    }

    this.territoryCount = {
      player1: player1Count,
      player2: player2Count
    };
  }

  checkWinCondition() {
    const totalCells = 100;
    const player1Territory = this.territoryCount.player1;
    const player2Territory = this.territoryCount.player2;

    // Victoire par contrôle de territoire (60%)
    if (player1Territory >= 60) {
      return {
        playerId: this.players[0].id,
        reason: 'territory',
        percentage: Math.round((player1Territory / totalCells) * 100)
      };
    }

    if (player2Territory >= 60) {
      return {
        playerId: this.players[1].id,
        reason: 'territory',
        percentage: Math.round((player2Territory / totalCells) * 100)
      };
    }

    // Victoire par élimination (adversaire n'a plus de dots)
    // ⚠️ On attend que les 2 joueurs aient eu au moins un tour (turnCount > 1)
    if (this.turnCount > 1) {
      if (player1Territory > 0 && player2Territory === 0) {
        return {
          playerId: this.players[0].id,
          reason: 'elimination',
          percentage: 100
        };
      }

      if (player2Territory > 0 && player1Territory === 0) {
        return {
          playerId: this.players[1].id,
          reason: 'elimination',
          percentage: 100
        };
      }
    }

    // Fin si la grille est pleine: gagnant = majorité, sinon match nul
    if (player1Territory + player2Territory === totalCells) {
      if (player1Territory > player2Territory) {
        return {
          playerId: this.players[0].id,
          reason: 'board_full',
          percentage: Math.round((player1Territory / totalCells) * 100)
        };
      }
      if (player2Territory > player1Territory) {
        return {
          playerId: this.players[1].id,
          reason: 'board_full',
          percentage: Math.round((player2Territory / totalCells) * 100)
        };
      }
      // Égalité parfaite
      return {
        playerId: null,
        reason: 'draw',
        percentage: 50
      };
    }

    return null; // Pas de gagnant encore
  }

  getCurrentPlayerData() {
    return {
      gameId: this.gameId,
      gameState: {
        grid: this.grid,
        currentPlayer: this.players[this.currentPlayer].id,
        players: this.players,
        turnCount: this.turnCount,
        territoryCount: this.territoryCount,
        gameState: this.gameState
      }
    };
  }

  isAi(playerId) {
    return typeof playerId === 'string' && playerId.startsWith('AI_');
  }

  computeAiMove(playerId) {
    const empties = [];
    let best = null;

    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        if (this.grid[x][y].owner === null) {
          const neighbors = this.getNeighbors(x, y);
          const ownAdj = neighbors.filter(({ nx, ny }) => this.grid[nx][ny].owner === playerId).length;
          const enemyAdj = neighbors.filter(({ nx, ny }) => {
            const o = this.grid[nx][ny].owner;
            return o !== null && o !== playerId;
          }).length;

          const score = ownAdj * 2 + enemyAdj; // Favoriser la consolidation et la pression
          const candidate = { x, y, score };
          empties.push(candidate);
          if (!best || candidate.score > best.score) best = candidate;
        }
      }
    }

    if (!empties.length) return null;
    // 30% de hasard parmi le top 10% pour varier
    const sorted = empties.sort((a, b) => b.score - a.score);
    const top = Math.max(1, Math.floor(sorted.length * 0.1));
    const pick = Math.random() < 0.3 ? sorted[Math.floor(Math.random() * top)] : best;
    return { x: pick.x, y: pick.y };
  }

  maybeTriggerAiMove(io) {
    const currentId = this.players[this.currentPlayer].id;
    if (this.isAi(currentId) && this.gameState === 'playing') {
      // Petit délai pour l'effet
      setTimeout(() => this.playAiTurn(io), 500);
      return true;
    }
    return false;
  }

  playAiTurn(io) {
    if (this.gameState !== 'playing') return;

    const aiId = this.players[this.currentPlayer].id;
    if (!this.isAi(aiId)) return;

    const move = this.computeAiMove(aiId);

    if (!move) {
      // Pas de coup possible (grille pleine) => évaluer fin
      this.updateTerritoryCount();
      const winner = this.checkWinCondition();
      if (winner) {
        this.gameState = 'finished';
        this.broadcastToPlayers(io, 'game-end', {
          winner: winner.playerId,
          reason: winner.reason,
          territoryPercentage: winner.percentage
        });
        activeGames.delete(this.gameId);
        this.clearTurnTimer();
      } else {
        // Passer le tour si vraiment aucun coup (devrait pas arriver)
        this.currentPlayer = (this.currentPlayer + 1) % 2;
        this.broadcastToPlayers(io, 'turn-changed', this.getCurrentPlayerData());
        this.startTurnTimer(io);
      }
      return;
    }

    const result = this.placeDot(move.x, move.y, aiId);
    if (!result.success) {
      // Si improbable, on retente rapidement
      return this.maybeTriggerAiMove(io);
    }

    // Broadcast placement
    this.broadcastToPlayers(io, 'dot-placed', {
      x: move.x, y: move.y, playerId: aiId,
      gameState: this.getCurrentPlayerData().gameState
    });

    // Expansions + captures
    const { expansions, captures } = this.processExpansions();
    if (expansions.length > 0) {
      this.broadcastToPlayers(io, 'expansion-occurred', {
        expansions,
        gameState: this.getCurrentPlayerData().gameState
      });
    }
    if (captures.length > 0) {
      this.broadcastToPlayers(io, 'capture-occurred', {
        captures,
        gameState: this.getCurrentPlayerData().gameState
      });
    }

    // Comptage + victoire
    this.updateTerritoryCount();
    const winner = this.checkWinCondition();
    if (winner) {
      this.gameState = 'finished';
      this.broadcastToPlayers(io, 'game-end', {
        winner: winner.playerId,
        reason: winner.reason,
        territoryPercentage: winner.percentage
      });
      activeGames.delete(this.gameId);
      this.clearTurnTimer();
      return;
    }

    // Tour suivant
    this.broadcastToPlayers(io, 'turn-changed', this.getCurrentPlayerData());
    this.startTurnTimer(io);
  }

  startTurnTimer(io) {
    this.clearTurnTimer();

    // Si c'est un tour IA, jouer tout de suite sans timer côté client
    if (this.maybeTriggerAiMove(io)) {
      return;
    }

    let timeLeft = 15;
    this.turnTimer = setInterval(() => {
      timeLeft--;

      // Broadcast du timer à tous les joueurs de cette partie
      this.players.forEach(player => {
        const socket = connectedPlayers.get(player.id);
        if (socket) {
          socket.emit('turn-timer', { timeLeft });
        }
      });

      if (timeLeft <= 0) {
        this.clearTurnTimer();
        this.handleTurnTimeout(io);
      }
    }, 1000);
  }

  clearTurnTimer() {
    if (this.turnTimer) {
      clearInterval(this.turnTimer);
      this.turnTimer = null;
    }
  }

  handleTurnTimeout(io) {
    console.log(`⏰ Timeout pour le joueur ${this.players[this.currentPlayer].id}`);

    // Passer au joueur suivant et avancer la notion de "tour" (pour maturations)
    this.currentPlayer = (this.currentPlayer + 1) % 2;
    this.turnCount++;

    // Traiter les expansions et captures qui arrivent à ce tour
    const { expansions, captures } = this.processExpansions();

    // Recompter le territoire et vérifier une fin de partie
    this.updateTerritoryCount();
    const winner = this.checkWinCondition();
    if (winner) {
      this.gameState = 'finished';

      // Broadcasts fin de partie
      this.broadcastToPlayers(io, 'turn-changed', this.getCurrentPlayerData());
      if (expansions.length > 0) {
        this.broadcastToPlayers(io, 'expansion-occurred', {
          expansions,
          gameState: this.getCurrentPlayerData().gameState
        });
      }
      if (captures.length > 0) {
        this.broadcastToPlayers(io, 'capture-occurred', {
          captures,
          gameState: this.getCurrentPlayerData().gameState
        });
      }

      this.broadcastToPlayers(io, 'game-end', {
        winner: winner.playerId,
        reason: winner.reason,
        territoryPercentage: winner.percentage
      });

      activeGames.delete(this.gameId);
      this.clearTurnTimer();
      return;
    }

    // Broadcast des changements d'état
    this.broadcastToPlayers(io, 'turn-changed', this.getCurrentPlayerData());

    if (expansions.length > 0) {
      this.broadcastToPlayers(io, 'expansion-occurred', {
        expansions,
        gameState: this.getCurrentPlayerData().gameState
      });
    }

    if (captures.length > 0) {
      this.broadcastToPlayers(io, 'capture-occurred', {
        captures,
        gameState: this.getCurrentPlayerData().gameState
      });
    }

    // Démarrer le timer pour le prochain joueur (ou IA)
    this.startTurnTimer(io);
  }

  broadcastToPlayers(io, event, data) {
    this.players.forEach(player => {
      const socket = connectedPlayers.get(player.id);
      if (socket) {
        socket.emit(event, data);
      }
    });
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 Nouvelle connexion socket:', socket.id);

  socket.on('join-game', async (data) => {
    try {
      const { playerId, playerName } = data;

      console.log(`🎯 ${playerName} rejoint la queue`);

      // Ajouter le joueur à la liste des connectés
      connectedPlayers.set(playerId, socket);
      socket.playerId = playerId;
      socket.playerName = playerName;

      // Ajouter à la queue
      gameQueue.push({ playerId, playerName, socket });

      if (gameQueue.length >= 2) {
        // Créer une nouvelle partie avec les 2 premiers joueurs
        const player1 = gameQueue.shift();
        const player2 = gameQueue.shift();

        const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const players = [
          { id: player1.playerId, playerName: player1.playerName },
          { id: player2.playerId, playerName: player2.playerName }
        ];

        const game = new BattleDots(gameId, players);
        activeGames.set(gameId, game);

        // Assigner les sockets aux rooms
        player1.socket.join(gameId);
        player2.socket.join(gameId);

        console.log(`🎮 Nouvelle partie Battle Dots créée: ${gameId}`);

        // Envoyer les données de début de partie
        const gameData = game.getCurrentPlayerData();
        player1.socket.emit('game-start', gameData);
        player2.socket.emit('game-start', gameData);

        // Démarrer le timer du premier tour (ou IA si c'est son tour)
        game.startTurnTimer(io);

      } else {
        // En attente d'un adversaire
        socket.emit('waiting-for-opponent', {
          queuePosition: gameQueue.length
        });
      }

    } catch (error) {
      console.error('Erreur join-game:', error);
      socket.emit('error', { message: 'Erreur lors de la recherche de partie' });
    }
  });

  // Nouveau: démarrer une partie contre l'IA
  socket.on('play-vs-ai', (data) => {
    try {
      const { playerId, playerName } = data;
      connectedPlayers.set(playerId, socket);
      socket.playerId = playerId;
      socket.playerName = playerName;

      const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const aiId = `AI_${gameId}`;
      const players = [
        { id: playerId, playerName },
        { id: aiId, playerName: 'IA' }
      ];

      const game = new BattleDots(gameId, players);
      activeGames.set(gameId, game);

      socket.join(gameId);

      console.log(`🤖 Partie vs IA créée: ${gameId}`);

      const gameData = game.getCurrentPlayerData();
      socket.emit('game-start', gameData);

      // Démarrer le timer (IA jouera instantané si c'est son tour)
      game.startTurnTimer(io);
    } catch (error) {
      console.error('Erreur play-vs-ai:', error);
      socket.emit('error', { message: 'Erreur lors de la création de la partie IA' });
    }
  });

  socket.on('place-dot', async (data) => {
    try {
      const { gameId, x, y, playerId } = data;
      const game = activeGames.get(gameId);

      if (!game) {
        socket.emit('error', { message: 'Partie introuvable' });
        return;
      }

      console.log(`🎯 Placement dot [${x}, ${y}] par ${playerId}`);

      const result = game.placeDot(x, y, playerId);

      if (!result.success) {
        socket.emit('error', { message: result.message });
        return;
      }

      // Arrêter le timer actuel
      game.clearTurnTimer();

      // Broadcast du placement à tous les joueurs
      const placementData = {
        x, y, playerId,
        gameState: game.getCurrentPlayerData().gameState
      };
      game.broadcastToPlayers(io, 'dot-placed', placementData);

      // Traiter les expansions et captures UNE SEULE FOIS ici
      const { expansions, captures } = game.processExpansions();

      if (expansions.length > 0) {
        game.broadcastToPlayers(io, 'expansion-occurred', {
          expansions,
          gameState: game.getCurrentPlayerData().gameState
        });
      }

      if (captures.length > 0) {
        game.broadcastToPlayers(io, 'capture-occurred', {
          captures,
          gameState: game.getCurrentPlayerData().gameState
        });
      }

      // Mise à jour du territoire + condition de fin
      game.updateTerritoryCount();
      const winner = game.checkWinCondition();

      if (winner) {
        console.log(`🏆 Partie ${gameId} terminée, gagnant: ${winner.playerId}`);

        game.broadcastToPlayers(io, 'game-end', {
          winner: winner.playerId,
          reason: winner.reason,
          territoryPercentage: winner.percentage
        });

        // Nettoyer la partie
        activeGames.delete(gameId);
        game.clearTurnTimer();
      } else {
        // Changer de tour
        game.broadcastToPlayers(io, 'turn-changed', game.getCurrentPlayerData());

        // Démarrer le timer pour le prochain tour (ou IA)
        game.startTurnTimer(io);
      }

    } catch (error) {
      console.error('Erreur place-dot:', error);
      socket.emit('error', { message: 'Erreur lors du placement' });
    }
  });

  socket.on('cancel-search', () => {
    try {
      const playerId = socket.playerId;

      // Retirer de la queue
      const index = gameQueue.findIndex(player => player.playerId === playerId);
      if (index !== -1) {
        gameQueue.splice(index, 1);
        console.log(`❌ ${socket.playerName} a annulé la recherche`);
      }

      // Retirer des joueurs connectés
      connectedPlayers.delete(playerId);

    } catch (error) {
      console.error('Erreur cancel-search:', error);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Déconnexion: ${socket.id}, raison: ${reason}`);

    try {
      const playerId = socket.playerId;

      if (playerId) {
        // Retirer de la queue si présent
        const queueIndex = gameQueue.findIndex(player => player.playerId === playerId);
        if (queueIndex !== -1) {
          gameQueue.splice(queueIndex, 1);
        }

        // Trouver la partie active du joueur
        let playerGame = null;
        for (const [gameId, game] of activeGames) {
          if (game.players.some(p => p.id === playerId)) {
            playerGame = { gameId, game };
            break;
          }
        }

        if (playerGame) {
          const { gameId, game } = playerGame;

          // Notifier l'autre joueur
          game.broadcastToPlayers(io, 'player-disconnected', {
            playerId,
            playerName: socket.playerName
          });

          // Nettoyer la partie après un délai
          setTimeout(() => {
            if (activeGames.has(gameId)) {
              console.log(`🧹 Nettoyage partie ${gameId} après déconnexion`);
              game.clearTurnTimer();

              game.broadcastToPlayers(io, 'player-left', {
                playerId,
                playerName: socket.playerName
              });

              activeGames.delete(gameId);
            }
          }, 30000); // 30 secondes de grâce
        }

        // Retirer des joueurs connectés
        connectedPlayers.delete(playerId);
      }

    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    }
  });
});

const PORT = process.env.PORT || 5002;
server.listen(PORT, () => {
  console.log(`🎯 Battle Dots Server running on port ${PORT}`);
});

// Nettoyage périodique des parties inactives
setInterval(() => {
  const now = Date.now();
  for (const [gameId, game] of activeGames) {
    // Supprimer les parties inactives depuis plus de 1 heure
    if (now - parseInt(gameId.split('_')[1]) > 3600000) {
      console.log(`🧹 Suppression partie inactive: ${gameId}`);
      game.clearTurnTimer();
      activeGames.delete(gameId);
    }
  }
}, 300000); // Vérification toutes les 5 minutes
