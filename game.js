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
    level = Math.floor(lines / 10) + 1;
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
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
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
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
  level = 1;
  paused = false;
  gameOver = false;
  resetRecordsForGame();
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

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
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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
