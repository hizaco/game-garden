const { v4: uuid } = require('uuid');

const SIZE = 9;
const DIRECTIONS = { RIGHT: 'R', LEFT: 'L', UP: 'U', DOWN: 'D' };
const ORIENTATIONS = ['/', '\\'];

function createLaserGame(p1, p2) {
  const id = uuid();
  const grid = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ({ type: 'empty' })));
  // Bases at middle left/right
  const base1 = { x: 4, y: 0, dir: DIRECTIONS.RIGHT, owner: p1.id };
  const base2 = { x: 4, y: SIZE - 1, dir: DIRECTIONS.LEFT, owner: p2.id };
  grid[base1.x][base1.y] = { type: 'base', owner: p1.id, dir: base1.dir };
  grid[base2.x][base2.y] = { type: 'base', owner: p2.id, dir: base2.dir };

  // Targets
  const targets = [];
  while (targets.length < 6) {
    const x = Math.floor(Math.random() * SIZE);
    const y = Math.floor(Math.random() * SIZE);
    if ((x === base1.x && y === base1.y) || (x === base2.x && y === base2.y)) continue;
    if (grid[x][y].type !== 'empty') continue;
    grid[x][y] = { type: 'target' };
    targets.push({ x, y });
  }

  const players = [p1, p2];
  const scores = { [p1.id]: 0, [p2.id]: 0 };
  let turnIndex = 0;

  return {
    id, grid, players, scores, targets, turnIndex,
    currentPlayer() { return players[this.turnIndex % 2]; },
    nextTurn() { this.turnIndex = (this.turnIndex + 1) % 2; },
    stateFor(viewerId) {
      return {
        size: SIZE,
        grid,
        players: players.map(p => ({ id: p.id, playerName: p.username })),
        currentPlayer: this.currentPlayer().id,
        scores,
        targets,
        viewerId
      };
    }
  };
}

function applyMirror(game, playerId, x, y, orientation) {
  if (!inBounds(x, y) || !ORIENTATIONS.includes(orientation)) return { ok: false, message: 'Invalid' };
  if (game.currentPlayer().id !== playerId) return { ok: false, message: 'Not your turn' };
  const cell = game.grid[x][y];
  if (cell.type !== 'empty') return { ok: false, message: 'Occupied' };
  game.grid[x][y] = { type: 'mirror', orientation, owner: playerId };
  return { ok: true };
}

function rotateMirror(game, playerId, x, y) {
  if (!inBounds(x, y)) return { ok: false, message: 'Invalid' };
  if (game.currentPlayer().id !== playerId) return { ok: false, message: 'Not your turn' };
  const cell = game.grid[x][y];
  if (cell.type !== 'mirror' || cell.owner !== playerId) return { ok: false, message: 'Not your mirror' };
  cell.orientation = cell.orientation === '/' ? '\\' : '/';
  return { ok: true, orientation: cell.orientation };
}

function fireLaser(game, playerId) {
  if (game.currentPlayer().id !== playerId) return { path: [], hit: null, scored: false, gameEnded: false };
  // find base for player
  let base;
  for (let i = 0; i < game.grid.length; i++) {
    for (let j = 0; j < game.grid[i].length; j++) {
      const c = game.grid[i][j];
      if (c.type === 'base' && c.owner === playerId) base = { x: i, y: j, dir: c.dir };
    }
  }
  let x = base.x, y = base.y, dir = base.dir;
  const path = [];
  let steps = 0;
  let hit = null;
  let scored = false;

  function step() {
    if (dir === DIRECTIONS.RIGHT) y += 1;
    else if (dir === DIRECTIONS.LEFT) y -= 1;
    else if (dir === DIRECTIONS.UP) x -= 1;
    else if (dir === DIRECTIONS.DOWN) x += 1;
  }

  while (inBounds(x, y) && steps < 200) {
    steps++;
    step();
    if (!inBounds(x, y)) break;
    path.push({ x, y });
    const c = game.grid[x][y];
    if (c.type === 'target') {
      // score
      hit = { type: 'target', x, y };
      scored = true;
      game.grid[x][y] = { type: 'empty' };
      game.targets = game.targets.filter(t => !(t.x === x && t.y === y));
      game.scores[playerId] += 1;
      break;
    } else if (c.type === 'base') {
      hit = { type: 'base', owner: c.owner, x, y };
      if (c.owner !== playerId) {
        game.scores[playerId] += 2;
      } else {
        game.scores[playerId] = Math.max(0, game.scores[playerId] - 1);
      }
      break;
    } else if (c.type === 'mirror') {
      // reflect
      if (c.orientation === '/') {
        if (dir === DIRECTIONS.RIGHT) dir = DIRECTIONS.UP;
        else if (dir === DIRECTIONS.LEFT) dir = DIRECTIONS.DOWN;
        else if (dir === DIRECTIONS.UP) dir = DIRECTIONS.RIGHT;
        else if (dir === DIRECTIONS.DOWN) dir = DIRECTIONS.LEFT;
      } else { // '\'
        if (dir === DIRECTIONS.RIGHT) dir = DIRECTIONS.DOWN;
        else if (dir === DIRECTIONS.LEFT) dir = DIRECTIONS.UP;
        else if (dir === DIRECTIONS.UP) dir = DIRECTIONS.LEFT;
        else if (dir === DIRECTIONS.DOWN) dir = DIRECTIONS.RIGHT;
      }
    }
  }

  const gameEnded = game.targets.length === 0 || (game.scores[playerId] >= 7);
  const winnerId = game.targets.length === 0
    ? (game.scores[game.players[0].id] >= game.scores[game.players[1].id] ? game.players[0].id : game.players[1].id)
    : (game.scores[playerId] >= 7 ? playerId : null);
  const reason = game.targets.length === 0 ? 'all-targets' : (winnerId ? 'score' : null);

  return { path, hit, scored, gameEnded, winnerId, reason };
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

module.exports = { createLaserGame, applyMirror, rotateMirror, fireLaser };
