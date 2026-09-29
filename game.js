'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  trackCombo(cleared);
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.max(gameStartLevel, Math.floor(lines / 10) + 1);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skins ----
const SKIN_STORAGE_KEY = 'tetris.skin';
const DEFAULT_SKIN = 'retro';

function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, r);
  } else {
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }
}

const SKINS = {
  retro: {
    colors: COLORS,
    boardBg: '#1a1a25',
    gridColor: '#22222e',
    drawBlock(context, x, y, color, size, alpha) {
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },
  neon: {
    colors: [
      null,
      '#00f0ff', // I
      '#fff200', // O
      '#d400ff', // T
      '#39ff14', // S
      '#ff073a', // Z
      '#2f5bff', // J
      '#ff8c00', // L
    ],
    boardBg: '#000000',
    gridColor: '#0e0e1c',
    drawBlock(context, x, y, color, size, alpha) {
      const px = x * size + 2, py = y * size + 2, s = size - 4;
      context.globalAlpha = alpha ?? 1;
      context.shadowColor = color;
      context.shadowBlur = size / 3;
      context.fillStyle = color;
      context.fillRect(px, py, s, s);
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      // dark core so the block reads as a glowing tube
      context.fillStyle = 'rgba(0,0,0,0.45)';
      context.fillRect(px + 3, py + 3, s - 6, s - 6);
      context.globalAlpha = 1;
    },
  },
  pastel: {
    colors: [
      null,
      '#a8e6ef', // I
      '#fdf1a7', // O
      '#d9b8f0', // T
      '#b8e6c1', // S
      '#f7b7b7', // Z
      '#b5c3f2', // J
      '#fcd2a8', // L
    ],
    boardBg: '#f6f1ec',
    gridColor: '#e6ddd4',
    drawBlock(context, x, y, color, size, alpha) {
      const px = x * size + 1.5, py = y * size + 1.5, s = size - 3;
      if (alpha !== undefined && alpha < 1) {
        // ghost: pastel fills vanish on the light board, so outline it instead
        context.globalAlpha = 0.5;
        context.fillStyle = color;
        roundedRectPath(context, px, py, s, s, size / 5);
        context.fill();
        context.strokeStyle = 'rgba(90,70,60,0.45)';
        context.lineWidth = 1.5;
        context.stroke();
        context.globalAlpha = 1;
        return;
      }
      context.globalAlpha = 1;
      context.fillStyle = color;
      roundedRectPath(context, px, py, s, s, size / 5);
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.08)';
      context.lineWidth = 1;
      context.stroke();
      // soft highlight
      context.fillStyle = 'rgba(255,255,255,0.45)';
      roundedRectPath(context, px + 3, py + 3, s - 6, s / 4, size / 10);
      context.fill();
      context.globalAlpha = 1;
    },
  },
  pixel: {
    colors: [
      null,
      '#3cbcfc', // I
      '#f8b800', // O
      '#b53cfc', // T
      '#58d854', // S
      '#e40058', // Z
      '#3c50fc', // J
      '#fc7460', // L
    ],
    boardBg: '#202028',
    gridColor: '#2a2a34',
    drawBlock(context, x, y, color, size, alpha) {
      const px = x * size, py = y * size;
      const p = Math.max(1, Math.floor(size / 10)); // one "art pixel"
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      // light edge (top/left)
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fillRect(px, py, size - p, p);
      context.fillRect(px, py, p, size - p);
      // dark edge (bottom/right)
      context.fillStyle = 'rgba(0,0,0,0.4)';
      context.fillRect(px + p, py + size - p, size - p, p);
      context.fillRect(px + size - p, py + p, p, size - p);
      // checker dither in the lower-right area
      context.fillStyle = 'rgba(0,0,0,0.18)';
      for (let yy = size / 2; yy < size - p; yy += p)
        for (let xx = size / 2; xx < size - p; xx += p)
          if (((xx + yy) / p) % 2 === 0) context.fillRect(px + xx, py + yy, p, p);
      // specular pixel
      context.fillStyle = 'rgba(255,255,255,0.7)';
      context.fillRect(px + 2 * p, py + 2 * p, p, p);
      context.globalAlpha = 1;
    },
  },
};

function isValidSkin(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(SKINS, name);
}

function loadSkinName() {
  try {
    const stored = localStorage.getItem(SKIN_STORAGE_KEY);
    if (isValidSkin(stored)) return stored;
  } catch (_) { /* storage unavailable */ }
  return DEFAULT_SKIN;
}

let skinName = loadSkinName();
let skin = SKINS[skinName];

function setSkin(name) {
  if (!isValidSkin(name)) name = DEFAULT_SKIN;
  skinName = name;
  skin = SKINS[name];
  try { localStorage.setItem(SKIN_STORAGE_KEY, name); } catch (_) { /* ignore */ }
  // redraw immediately, even while paused (the rAF loop may be stopped)
  if (board && current) draw();
  if (next) drawNext();
}

const skinSelect = document.getElementById('skin-select');
if (skinSelect) {
  skinSelect.value = skinName;
  skinSelect.addEventListener('change', () => {
    setSkin(skinSelect.value);
    skinSelect.blur();
  });
  // keep game keys working if the select still has focus
  const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyP', 'KeyX'];
  skinSelect.addEventListener('keydown', e => {
    if (GAME_KEYS.includes(e.code)) {
      e.preventDefault();
      skinSelect.blur();
    }
  });
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  skin.drawBlock(context, x, y, skin.colors[colorIndex], size, alpha);
}
// ---- end Skins ----

function drawGrid() {
  ctx.strokeStyle = skin.gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = skin.boardBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextCtx.fillStyle = skin.boardBg;
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  onGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    hidePauseMenu();
    startInputGrace();
    dropAccum = 0;
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showPauseMenu();
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return; // endGame() ran inside this frame; don't reschedule
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  gameStartLevel = startLevel;
  level = gameStartLevel;
  paused = false;
  gameOver = false;
  resetRecordsForGame();
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  hidePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Pause menu ----
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsToggleBtn = document.getElementById('controls-toggle-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level-select');

const INPUT_GRACE_MS = 150;

let startLevel = Number(startLevelSelect.value) || 1; // chosen in the menu, applied on next init()
let gameStartLevel = startLevel;                       // start level of the game in progress
let inputGraceUntil = 0;
const heldKeys = new Set();  // keys currently physically held down
let staleKeys = new Set();   // keys held at resume; their auto-repeat is ignored until released

function showPauseMenu() {
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function hidePauseMenu() {
  pauseMenu.classList.add('hidden');
  // Drop focus so Space/arrows during play don't re-activate menu controls
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
}

function startInputGrace() {
  inputGraceUntil = performance.now() + INPUT_GRACE_MS;
  staleKeys = new Set(heldKeys);
}

function isGameInputBlocked(e) {
  if (performance.now() < inputGraceUntil) return true;
  return e.repeat && staleKeys.has(e.code);
}

document.addEventListener('keydown', e => { heldKeys.add(e.code); });
document.addEventListener('keyup', e => {
  heldKeys.delete(e.code);
  staleKeys.delete(e.code);
});
window.addEventListener('blur', () => {
  heldKeys.clear();
  staleKeys.clear();
});

resumeBtn.addEventListener('click', () => {
  resumeBtn.blur();
  if (paused) togglePause();
});

pauseRestartBtn.addEventListener('click', () => {
  pauseRestartBtn.blur();
  init();
  startInputGrace();
});

controlsToggleBtn.addEventListener('click', () => {
  const open = pauseControls.classList.toggle('hidden') === false;
  controlsToggleBtn.setAttribute('aria-expanded', String(open));
  controlsToggleBtn.textContent = open ? 'Ocultar controles' : 'Ver controles';
});

startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value) || 1;
});

// The game-over restart button also must not keep focus after a click
restartBtn.addEventListener('click', () => restartBtn.blur());
// ---- End pause menu ----

// ---- Records ----
const RECORDS_KEY = 'tetris.records';
const STATS_KEY = 'tetris.stats';
const MAX_RECORDS = 5;
const MAX_NAME_LENGTH = 12;

const startScreen = document.getElementById('start-screen');
const startRecordsTable = document.getElementById('start-records-table');
const startRecordsStats = document.getElementById('start-records-stats');
const playBtn = document.getElementById('play-btn');
const clearRecordsBtn = document.getElementById('clear-records-btn');
const gameOverRecords = document.getElementById('gameover-records');
const gameOverRecordsTable = document.getElementById('gameover-records-table');
const gameOverRecordsStats = document.getElementById('gameover-records-stats');
const recordForm = document.getElementById('record-form');
const recordNameInput = document.getElementById('record-name');
const menuBtn = document.getElementById('menu-btn');

let combo = 0;
let maxCombo = 0;
let pendingRecord = null; // qualifying entry waiting for a name
let savedRecord = null;   // entry saved this game, highlighted in the table

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function sortRecords(list) {
  return list.sort((a, b) => b.score - a.score);
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!Array.isArray(data)) return [];
    const valid = data
      .filter(r => r && typeof r === 'object')
      .map(r => ({
        name: String(r.name ?? '').slice(0, MAX_NAME_LENGTH),
        score: toCount(r.score),
        lines: toCount(r.lines),
        level: toCount(r.level),
        combo: toCount(r.combo),
        date: typeof r.date === 'string' ? r.date : '',
      }));
    return sortRecords(valid).slice(0, MAX_RECORDS);
  } catch (err) {
    return [];
  }
}

function saveRecords(list) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(list));
  } catch (err) {
    // storage unavailable (private mode, quota): keep playing without persistence
  }
}

function loadStats() {
  try {
    const data = JSON.parse(localStorage.getItem(STATS_KEY));
    if (!data || typeof data !== 'object') return { bestCombo: 0, maxLines: 0 };
    return { bestCombo: toCount(data.bestCombo), maxLines: toCount(data.maxLines) };
  } catch (err) {
    return { bestCombo: 0, maxLines: 0 };
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (err) {
    // storage unavailable: ignore
  }
}

function clearRecords() {
  try {
    localStorage.removeItem(RECORDS_KEY);
    localStorage.removeItem(STATS_KEY);
  } catch (err) {
    // storage unavailable: ignore
  }
}

function qualifiesForRecords(value, list) {
  if (value <= 0) return false;
  return list.length < MAX_RECORDS || value > list[list.length - 1].score;
}

function formatRecordDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function renderRecordsTable(table, list, highlight) {
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const title of ['#', 'NOMBRE', 'PUNTOS', 'LÍNEAS', 'NIVEL', 'COMBO', 'FECHA']) {
    const th = document.createElement('th');
    th.textContent = title;
    head.appendChild(th);
  }
  const body = table.createTBody();
  if (!list.length) {
    const cell = body.insertRow().insertCell();
    cell.colSpan = 7;
    cell.className = 'empty';
    cell.textContent = 'Sin records todavía';
    return;
  }
  list.forEach((r, i) => {
    const row = body.insertRow();
    if (r === highlight) row.className = 'highlight';
    const values = [
      i + 1,
      r.name || (r === pendingRecord ? '???' : 'Anónimo'),
      r.score.toLocaleString(),
      r.lines,
      r.level,
      r.combo,
      formatRecordDate(r.date),
    ];
    values.forEach((v, j) => {
      const cell = row.insertCell();
      cell.textContent = String(v); // textContent: user names are never parsed as HTML
      if (j === 1) cell.className = 'name';
    });
  });
}

function renderStats(el) {
  const stats = loadStats();
  el.textContent = `Mejor combo: ${stats.bestCombo} · Máx. líneas: ${stats.maxLines}`;
}

function trackCombo(cleared) {
  if (cleared > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
}

function resetRecordsForGame() {
  if (pendingRecord) savePendingRecord(); // leaving without Guardar still keeps the record
  combo = 0;
  maxCombo = 0;
  pendingRecord = null;
  savedRecord = null;
  gameOverRecords.classList.add('hidden');
  recordForm.classList.add('hidden');
}

function updateGlobalStats() {
  const stats = loadStats();
  stats.bestCombo = Math.max(stats.bestCombo, maxCombo);
  stats.maxLines = Math.max(stats.maxLines, lines);
  saveStats(stats);
}

function renderGameOverRecords() {
  const list = loadRecords();
  let highlight = null;
  if (pendingRecord) {
    list.push(pendingRecord);
    highlight = pendingRecord;
  } else if (savedRecord) {
    highlight = list.find(r =>
      r.date === savedRecord.date && r.score === savedRecord.score && r.name === savedRecord.name) || null;
    if (!highlight) {
      // storage unavailable: still show the entry from memory
      list.push(savedRecord);
      highlight = savedRecord;
    }
  }
  renderRecordsTable(gameOverRecordsTable, sortRecords(list).slice(0, MAX_RECORDS), highlight);
  renderStats(gameOverRecordsStats);
}

function onGameOverRecords() {
  updateGlobalStats();
  pendingRecord = null;
  savedRecord = null;
  if (qualifiesForRecords(score, loadRecords())) {
    pendingRecord = {
      name: '',
      score,
      lines,
      level,
      combo: maxCombo,
      date: new Date().toISOString(),
    };
    recordNameInput.value = '';
    recordForm.classList.remove('hidden');
  } else {
    recordForm.classList.add('hidden');
  }
  renderGameOverRecords();
  gameOverRecords.classList.remove('hidden');
  if (pendingRecord) recordNameInput.focus();
}

function savePendingRecord() {
  if (!pendingRecord) return;
  const entry = pendingRecord;
  entry.name = recordNameInput.value.trim().slice(0, MAX_NAME_LENGTH) || 'Anónimo';
  pendingRecord = null;
  const list = loadRecords();
  list.push(entry);
  saveRecords(sortRecords(list).slice(0, MAX_RECORDS));
  savedRecord = entry;
  recordNameInput.blur();
  recordForm.classList.add('hidden');
  renderGameOverRecords();
}

function showStartScreen() {
  if (pendingRecord) savePendingRecord(); // leaving without Guardar still keeps the record
  cancelAnimationFrame(animId);
  overlay.classList.add('hidden');
  renderRecordsTable(startRecordsTable, loadRecords(), null);
  renderStats(startRecordsStats);
  startScreen.classList.remove('hidden');
}

function startGame() {
  startScreen.classList.add('hidden');
  playBtn.blur();
  init();
}

function shouldIgnoreGameKey(e) {
  // Don't drive the game while typing a name or while the start screen is up.
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return true;
  return !startScreen.classList.contains('hidden');
}

recordForm.addEventListener('submit', e => {
  e.preventDefault(); // Enter in the input or the Guardar button both land here
  savePendingRecord();
});

playBtn.addEventListener('click', startGame);
menuBtn.addEventListener('click', showStartScreen);

clearRecordsBtn.addEventListener('click', () => {
  if (!window.confirm('¿Seguro que quieres borrar todos los records?')) return;
  clearRecords();
  showStartScreen();
});

document.addEventListener('keydown', e => {
  if (shouldIgnoreGameKey(e)) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (!e.repeat) togglePause();
    return;
  }
  if (paused || gameOver) return;
  if (isGameInputBlocked(e)) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

showStartScreen();
