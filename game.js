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
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
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

document.addEventListener('keydown', e => {
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

init();
