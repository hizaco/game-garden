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
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quantum-garden', {
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

// Active games management
let activeGames = new Map();
let connectedPlayers = new Map();
let gameQueue = [];

class QuantumGarden {
  constructor(gameId, players) {
    this.gameId = gameId;
    this.players = players;
    this.grid = this.initializeGrid();
    this.currentPlayer = 0;
    this.level = 1;
    this.objectives = this.generateObjectives();
    this.gameState = 'playing';
    this.quantumStates = new Map();
  }

  initializeGrid() {
    const grid = [];
    for (let i = 0; i < 8; i++) {
      grid[i] = [];
      for (let j = 0; j < 8; j++) {
        grid[i][j] = {
          type: 'empty',
          quantumState: 'superposition',
          possibleStates: ['flower', 'tree', 'crystal'],
          collapsed: false,
          energy: Math.random() * 100
        };
      }
    }
    return grid;
  }

  generateObjectives() {
    return {
      flowers: Math.floor(Math.random() * 5) + 3,
      trees: Math.floor(Math.random() * 3) + 2,
      crystals: Math.floor(Math.random() * 2) + 1,
      patterns: this.generatePatterns()
    };
  }

  generatePatterns() {
    const patterns = ['line', 'square', 'triangle', 'cross'];
    return patterns[Math.floor(Math.random() * patterns.length)];
  }

  observeCell(x, y, playerId) {
    if (this.grid[x] && this.grid[x][y] && !this.grid[x][y].collapsed) {
      const cell = this.grid[x][y];

      const chosenState = cell.possibleStates[Math.floor(Math.random() * cell.possibleStates.length)];

      cell.type = chosenState;
      cell.collapsed = true;
      cell.quantumState = 'collapsed';

      this.applyQuantumEntanglement(x, y);

      return {
        success: true,
        newState: chosenState,
        position: { x, y },
        playerId: playerId
      };
    }
    return { success: false };
  }

  applyQuantumEntanglement(x, y) {
    const neighbors = [
      [x-1, y], [x+1, y], [x, y-1], [x, y+1],
      [x-1, y-1], [x-1, y+1], [x+1, y-1], [x+1, y+1]
    ];

    neighbors.forEach(([nx, ny]) => {
      if (this.grid[nx] && this.grid[nx][ny] && !this.grid[nx][ny].collapsed) {
        this.grid[nx][ny].energy += Math.random() * 20 - 10;
        if (Math.random() < 0.3) {
          this.grid[nx][ny].possibleStates.splice(Math.floor(Math.random() * this.grid[nx][ny].possibleStates.length), 1);
          if (this.grid[nx][ny].possibleStates.length === 0) {
            this.grid[nx][ny].possibleStates = ['empty'];
          }
        }
      }
    });
  }

  checkWinCondition() {
    const counts = { flower: 0, tree: 0, crystal: 0 };

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if (this.grid[i][j].collapsed) {
          counts[this.grid[i][j].type]++;
        }
      }
    }

    return counts.flower >= this.objectives.flowers &&
           counts.tree >= this.objectives.trees &&
           counts.crystal >= this.objectives.crystals;
  }

  getGameState() {
    return {
      gameId: this.gameId,
      grid: this.grid,
      players: this.players,
      currentPlayer: this.currentPlayer,
      level: this.level,
      objectives: this.objectives,
      gameState: this.gameState
    };
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join-game', (data) => {
    const { playerId, playerName } = data;
    connectedPlayers.set(socket.id, { playerId, playerName, socketId: socket.id });

    gameQueue.push({ playerId, playerName, socketId: socket.id });

    if (gameQueue.length >= 2) {
      const player1 = gameQueue.shift();
      const player2 = gameQueue.shift();

      const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const game = new QuantumGarden(gameId, [player1, player2]);

      activeGames.set(gameId, game);

      io.sockets.sockets.get(player1.socketId)?.join(gameId);
      io.sockets.sockets.get(player2.socketId)?.join(gameId);

      io.to(gameId).emit('game-start', {
        gameId: gameId,
        gameState: game.getGameState(),
        message: 'Quantum Garden game started!'
      });

      console.log(`Game ${gameId} started with players:`, player1.playerName, player2.playerName);
    } else {
      socket.emit('waiting-for-opponent', {
        message: 'Waiting for another player to join...',
        queuePosition: gameQueue.length
      });
    }
  });

  socket.on('observe-cell', (data) => {
    const { gameId, x, y, playerId } = data;
    const game = activeGames.get(gameId);

    if (game && game.gameState === 'playing') {
      const result = game.observeCell(x, y, playerId);

      if (result.success) {
        io.to(gameId).emit('cell-observed', {
          position: { x, y },
          newState: result.newState,
          playerId: playerId,
          gameState: game.getGameState()
        });

        if (game.checkWinCondition()) {
          game.gameState = 'completed';
          io.to(gameId).emit('game-end', {
            winner: playerId,
            gameState: game.getGameState(),
            message: 'Quantum Garden completed!'
          });

          setTimeout(() => {
            activeGames.delete(gameId);
          }, 30000);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    const player = connectedPlayers.get(socket.id);
    if (player) {
      connectedPlayers.delete(socket.id);

      const queueIndex = gameQueue.findIndex(p => p.socketId === socket.id);
      if (queueIndex !== -1) {
        gameQueue.splice(queueIndex, 1);
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    activeGames: activeGames.size,
    connectedPlayers: connectedPlayers.size,
    queueLength: gameQueue.length
  });
});

const PORT = process.env.PORT || 5002;
server.listen(PORT, () => {
  console.log(`🚀 Quantum Garden Server running on port ${PORT}`);
  console.log(`🎮 Game ready for multiplayer connections!`);
});
