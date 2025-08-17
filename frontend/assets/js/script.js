// Laser Game front-end (CSP-safe, no inline handlers)
let socket = null;
let currentUser = null;
let currentGameId = null;
let gameState = null;

let selectedMode = 'multiplayer';
let selectedDifficulty = 'medium';
let currentTool = 'place-slash'; // place-slash | place-backslash | rotate

document.addEventListener('DOMContentLoaded', async () => {
  if (window.location.pathname !== '/login') {
    await checkAuth();
  }
  initializeSocket();
  setupUI();
  createBoard(9);
});


async function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login';
    return;
  }
  try {
    const r = await fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error('auth');
    const data = await r.json();
    currentUser = data.user;
    setText('player-name', currentUser.username);
    return true;
  } catch {
    localStorage.removeItem('token');
    window.location.href = '/login';
    return false;
  }
}

function initializeSocket() {
  if (socket) socket.disconnect();
  socket = io({ auth: { token: localStorage.getItem('token') } });

  socket.on('connect', () => {
    setOnline(true);
  });
  socket.on('disconnect', () => setOnline(false));

  socket.on('waiting-for-opponent', (d) => {
    showModal('File d’attente', `Position dans la file: ${d.queuePosition}`);
  });

  socket.on('game-start', (data) => {
    currentGameId = data.gameId;
    gameState = data.gameState;
    clearModal();
    drawState(gameState);
    log('🎮 Partie démarrée.');
    updateScoresAndTargets();
    updateTurnText();
  });

  socket.on('mirror-updated', (data) => {
    gameState = data.gameState;
    drawState(gameState);
    log(`🪞 Mirror ${data.orientation} placé/roté en [${data.x+1}, ${data.y+1}]`);
    updateTurnText();
  });

  socket.on('laser-path', (data) => {
    gameState = data.gameState;
    renderLaserPath(data.path);
    if (data.hit) {
      log(`🔺 Laser hit: ${data.hit.type}${data.hit.owner ? ' ('+data.hit.owner.slice(0,6)+')' : ''}`);
    } else {
      log('💨 Laser dissipé.');
    }
    updateScoresAndTargets();
    updateTurnText();
  });

  socket.on('score-updated', (data) => {
    if (gameState) gameState.scores = data.scores;
    updateScoresAndTargets(data.remainingTargets);
  });

  socket.on('turn-changed', (data) => {
    gameState = data.gameState;
    updateTurnText();
  });

  socket.on('game-end', (data) => {
    const isWinner = data.winner === currentUser.id;
    showModal('Fin de partie', isWinner ? '🎉 Victoire!' : '😞 Défaite.');
    log(`🏁 Fin — Gagnant: ${data.winner?.slice(0,6)} | Raison: ${data.reason}`);
    setTimeout(() => { clearLaser(); }, 300);
  });

  socket.on('error-msg', (e) => {
    showModal('Erreur', e.message || 'Action invalide');
  });
}

function setupUI() {
  // Buttons
  byId('new-game-btn').addEventListener('click', () => openModeModal());
  byId('mode-btn').addEventListener('click', () => openModeModal());
  byId('place-slash').addEventListener('click', () => setTool('place-slash'));
  byId('place-backslash').addEventListener('click', () => setTool('place-backslash'));
  byId('rotate-btn').addEventListener('click', () => setTool('rotate'));
  byId('fire-btn').addEventListener('click', () => socket.emit('fire-laser'));
  byId('profile-btn').addEventListener('click', () => window.location.href = '/profile');
  byId('logout-btn').addEventListener('click', logout);

  // Mode modal
  byId('start-game-confirm').addEventListener('click', () => {
    const mp = byId('mode-mp').checked;
    selectedMode = mp ? 'multiplayer' : 'solo';
    selectedDifficulty = byId('difficulty-select').value || 'medium';
    closeModal(byId('mode-modal'));
    startNewGame();
  });

  document.addEventListener('click', (e) => {
    const mclose = e.target.closest?.('[data-modal-close]');
    if (mclose) closeModal(mclose.closest('.modal'));
  });
  document.addEventListener('click', (e) => {
    if (e.target.classList?.contains('modal')) closeModal(e.target);
  });
}

function openModeModal() {
  const modeLabel = byId('mode-label');
  modeLabel.textContent = selectedMode === 'solo' ? 'Solo' : 'Multijoueur';
  openModal('mode-modal');
}

function startNewGame() {
  if (!socket || !currentUser) return;
  clearLaser();
  clearLog();
  setText('current-turn-text', 'En attente...');
  setText('targets-left', '-');
  setText('score-p1', '0');
  setText('score-p2', '0');

  socket.emit('join-game', {
    playerId: currentUser.id,
    playerName: currentUser.username,
    mode: selectedMode,
    difficulty: selectedDifficulty
  });
}

function createBoard(size) {
  const board = byId('game-board');
  board.innerHTML = '';
  board.style.gridTemplateColumns = `repeat(${size}, 64px)`;
  board.style.gridTemplateRows = `repeat(${size}, 64px)`;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = i;
      cell.dataset.y = j;
      cell.addEventListener('click', onCellClick);
      board.appendChild(cell);
    }
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function drawState(state) {
  const size = state.size || 9;
  const board = byId('game-board');
  const cells = board.querySelectorAll('.cell');
  cells.forEach(c => {
    c.className = 'cell';
    c.textContent = '';
  });
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const cellEl = board.querySelector(`.cell[data-x="${i}"][data-y="${j}"]`);
      const cell = state.grid[i][j];
      if (cell.type === 'base') {
        cellEl.classList.add('base', state.players[0].id === cell.owner ? 'p1' : 'p2');
        cellEl.textContent = '⧉';
      } else if (cell.type === 'target') {
        cellEl.classList.add('target');
        cellEl.textContent = '◆';
      } else if (cell.type === 'mirror') {
        cellEl.classList.add('mirror');
        cellEl.textContent = cell.orientation;
      }
    }
  }
}

function onCellClick(e) {
  if (!gameState) return;
  const x = parseInt(e.currentTarget.dataset.x, 10);
  const y = parseInt(e.currentTarget.dataset.y, 10);
  if (currentTool === 'place-slash') {
    socket.emit('place-mirror', { x, y, orientation: '/' });
  } else if (currentTool === 'place-backslash') {
    socket.emit('place-mirror', { x, y, orientation: '\\' });
  } else if (currentTool === 'rotate') {
    socket.emit('rotate-mirror', { x, y });
  }
}

function setTool(tool) {
  currentTool = tool;
  log(`🔧 Outil: ${tool}`);
}

// Laser rendering
function renderLaserPath(path) {
  clearLaser();
  const canvas = byId('laser-canvas');
  const ctx = canvas.getContext('2d');
  if (!path || !path.length) return;
  const board = byId('game-board');
  const rect = board.getBoundingClientRect();
  const cell = board.querySelector('.cell');
  const cw = cell.offsetWidth;
  const ch = cell.offsetHeight;

  ctx.strokeStyle = '#ff3864';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = '#ff3864';
  ctx.shadowBlur = 8;

  ctx.beginPath();
  const start = path[0];
  ctx.moveTo(rect.left + start.y * (cw + 4) + cw / 2, rect.top + start.x * (ch + 4) + ch / 2);
  for (let i = 1; i < path.length; i++) {
    const p = path[i];
    ctx.lineTo(rect.left + p.y * (cw + 4) + cw / 2, rect.top + p.x * (ch + 4) + ch / 2);
  }
  ctx.stroke();
}

function resizeCanvas() {
  const canvas = byId('laser-canvas');
  const board = byId('game-board');
  const r = board.getBoundingClientRect();
  canvas.width = r.width;
  canvas.height = r.height;
  canvas.style.width = r.width + 'px';
  canvas.style.height = r.height + 'px';
  clearLaser();
}

function clearLaser() {
  const canvas = byId('laser-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// UI helpers
function showModal(title, message) {
  setText('modal-title', title);
  setText('modal-message', message);
  openModal('game-modal');
}
function clearModal() {
  closeModal(byId('game-modal'));
}
function openModal(id) {
  const m = byId(id);
  if (m) m.hidden = false;
}
function closeModal(el) {
  const m = el?.closest?.('.modal') || el;
  if (m) m.hidden = true;
}

function updateTurnText() {
  const me = currentUser?.id;
  const cur = gameState?.currentPlayer;
  const players = gameState?.players || [];
  const name = players.find(p => p.id === cur)?.playerName || 'Joueur';
  setText('current-turn-text', cur === me ? 'À votre tour!' : `Tour de ${name}`);
}

function updateScoresAndTargets(remaining) {
  const p1 = gameState.players[0].id;
  const p2 = gameState.players[1].id;
  setText('score-p1', (gameState.scores?.[p1] ?? 0).toString());
  setText('score-p2', (gameState.scores?.[p2] ?? 0).toString());
  setText('targets-left', remaining != null ? remaining : (gameState.targets?.length ?? '-'));
}

function setOnline(on) {
  const ind = byId('status-indicator');
  const txt = byId('status-text');
  if (!ind || !txt) return;
  ind.className = 'status-indicator ' + (on ? 'online' : 'offline');
  txt.textContent = on ? 'Connecté' : 'Déconnecté';
}

function logout() {
  localStorage.removeItem('token');
  window.location.href = '/login';
}

// DOM helpers
function byId(id) { return document.getElementById(id); }
function setText(id, text) { const el = byId(id); if (el) el.textContent = text; }
function log(msg) {
  const box = byId('game-log-content');
  if (!box) return;
  const p = document.createElement('div');
  p.textContent = `${new Date().toLocaleTimeString()} - ${msg}`;
  box.appendChild(p);
  while (box.children.length > 80) box.removeChild(box.firstChild);
}
