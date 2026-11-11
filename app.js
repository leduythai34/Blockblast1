/**
 * AR BLOCK BLAST - Dual Hand Gesture Controlled (8x8 Grid + Solvable Piece Generator)
 * - Hỗ trợ 2 bàn tay chọn và di chuyển 2 khối cùng lúc
 * - Cử chỉ dùng Tay Phải hất ngang (Swipe) để Reset trò chơi
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const videoElement = document.getElementById('webcam');

const scoreEl = document.getElementById('scoreValue');
const bestScoreEl = document.getElementById('bestScoreValue');
const comboEl = document.getElementById('comboValue');
const statusTextEl = document.getElementById('statusText');
const camDotEl = document.getElementById('camDot');
const toggleCameraBgEl = document.getElementById('toggleCameraBg');
const resetBtn = document.getElementById('resetBtn');

// --- CẤU HÌNH BẢNG & KHỐI ---
const GRID_SIZE = 8;
let board = []; // 8x8 lưu màu hoặc null
let score = 0;
let bestScore = Number(localStorage.getItem('ar_blockblast_best') || 0);
let combo = 0;
bestScoreEl.textContent = bestScore;

// Danh sách các hình dạng khối trong Block Blast (tọa độ [r, c])
const SHAPES = [
  // Đơn & Thanh ngang/dọc
  { name: '1x1', cells: [[0, 0]], color: '#38bdf8' },
  { name: '1x2', cells: [[0, 0], [0, 1]], color: '#60a5fa' },
  { name: '2x1', cells: [[0, 0], [1, 0]], color: '#60a5fa' },
  { name: '1x3', cells: [[0, 0], [0, 1], [0, 2]], color: '#34d399' },
  { name: '3x1', cells: [[0, 0], [1, 0], [2, 0]], color: '#34d399' },
  { name: '1x4', cells: [[0, 0], [0, 1], [0, 2], [0, 3]], color: '#a78bfa' },
  { name: '4x1', cells: [[0, 0], [1, 0], [2, 0], [3, 0]], color: '#a78bfa' },
  { name: '1x5', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], color: '#f472b6' },
  { name: '5x1', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], color: '#f472b6' },

  // Ô vuông
  { name: '2x2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], color: '#fbbf24' },
  {
    name: '3x3',
    cells: [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2]
    ],
    color: '#f97316'
  },

  // Chữ L nhỏ (3 ô)
  { name: 'L3_1', cells: [[0, 0], [1, 0], [1, 1]], color: '#fb7185' },
  { name: 'L3_2', cells: [[0, 0], [0, 1], [1, 0]], color: '#fb7185' },
  { name: 'L3_3', cells: [[0, 0], [0, 1], [1, 1]], color: '#fb7185' },
  { name: 'L3_4', cells: [[0, 1], [1, 0], [1, 1]], color: '#fb7185' },

  // Chữ L lớn (5 ô - 3x3 góc)
  { name: 'L5_1', cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], color: '#f43f5e' },
  { name: 'L5_2', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]], color: '#f43f5e' },
  { name: 'L5_3', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], color: '#f43f5e' },
  { name: 'L5_4', cells: [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]], color: '#f43f5e' },

  // Chữ T & Z (4 ô)
  { name: 'T4_1', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], color: '#c084fc' },
  { name: 'T4_2', cells: [[0, 1], [1, 0], [1, 1], [1, 2]], color: '#c084fc' },
  { name: 'Z4_1', cells: [[0, 0], [0, 1], [1, 1], [1, 2]], color: '#4ade80' },
  { name: 'Z4_2', cells: [[0, 1], [0, 2], [1, 0], [1, 1]], color: '#4ade80' }
];

// --- TRẠNG THÁI KHỐI DỰ BỊ & KÉO THẢ ---
let trayPieces = []; // 3 khối bên phải
let mouseDrag = {
  grabbedPieceIndex: -1,
  pos: { x: 0, y: 0 }
};

// Hiệu ứng nổ hàng/cột & chữ nổi
let particles = [];
let floatingTexts = [];
let cellFlashAnimations = [];
let swipeResetBanner = { alpha: 0, text: '' };

// --- TRẠNG THÁI 2 BÀN TAY (TRÁI & PHẢI) ---
const SMOOTH_FACTOR = 0.78;
let lastSwipeResetTime = 0;
const SWIPE_RESET_COOLDOWN_MS = 1400;

function createHandTracker(side, labelVi, accentColor) {
  return {
    side, // 'Right' hoặc 'Left' (theo tay thật của người chơi)
    labelVi,
    accentColor,
    detected: false,
    thumbTip: { x: 0, y: 0 },
    indexTip: { x: 0, y: 0 },
    palmCenter: { x: 0, y: 0 },
    pinchPoint: { x: 0, y: 0 },
    isPinching: false,
    wasPinching: false,
    grabbedPieceIndex: -1,
    dragPos: { x: 0, y: 0 },
    landmarks: null,
    // Lịch sử di chuyển lòng bàn tay để phát hiện cử chỉ hất tay (Swipe)
    swipeHistory: [] // [{ x, y, t }]
  };
}

const handsTrackers = {
  Right: createHandTracker('Right', 'Tay Phải', '#38bdf8'),
  Left: createHandTracker('Left', 'Tay Trái', '#c084fc')
};

// Layout tính toán theo kích thước màn hình
let layout = {
  boardX: 0,
  boardY: 0,
  boardSize: 0,
  cellSize: 0,
  traySlots: []
};

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  computeLayout();
}
window.addEventListener('resize', resizeCanvas);

function computeLayout() {
  const w = canvas.width;
  const h = canvas.height;
  const topSpace = 90;
  const bottomSpace = 75;
  const availH = h - topSpace - bottomSpace;

  const maxBoardSize = Math.min(availH * 0.92, w * 0.56);
  const cellSize = Math.floor(maxBoardSize / GRID_SIZE);
  const boardSize = cellSize * GRID_SIZE;

  const totalContentWidth = boardSize + Math.min(280, w * 0.28);
  const startX = Math.max(24, (w - totalContentWidth) / 2);
  const boardX = startX;
  const boardY = topSpace + (availH - boardSize) / 2;

  const trayX = boardX + boardSize + Math.max(28, w * 0.035);
  const trayWidth = Math.min(250, w - trayX - 24);
  const slotHeight = boardSize / 3;

  const traySlots = [];
  for (let i = 0; i < 3; i++) {
    traySlots.push({
      x: trayX,
      y: boardY + i * slotHeight,
      width: trayWidth,
      height: slotHeight - 12,
      centerX: trayX + trayWidth / 2,
      centerY: boardY + i * slotHeight + (slotHeight - 12) / 2
    });
  }

  layout = { boardX, boardY, boardSize, cellSize, traySlots };
}

// --- LOGIC BẢNG & KIỂM TRA HỢP LỆ ---
function createEmptyBoard() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

function cloneBoard(b) {
  return b.map(row => [...row]);
}

function getShapeBounds(cells) {
  let maxR = 0, maxC = 0;
  for (const [r, c] of cells) {
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  return { rows: maxR + 1, cols: maxC + 1 };
}

function canPlaceShape(targetBoard, shape, startR, startC) {
  for (const [dr, dc] of shape.cells) {
    const r = startR + dr;
    const c = startC + dc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
    if (targetBoard[r][c] !== null) return false;
  }
  return true;
}

function simulatePlaceAndClear(targetBoard, shape, startR, startC) {
  const nextB = cloneBoard(targetBoard);
  for (const [dr, dc] of shape.cells) {
    nextB[startR + dr][startC + dc] = shape.color;
  }

  const fullRows = [];
  const fullCols = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    if (nextB[r].every(cell => cell !== null)) fullRows.push(r);
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    let full = true;
    for (let r = 0; r < GRID_SIZE; r++) {
      if (nextB[r][c] === null) {
        full = false;
        break;
      }
    }
    if (full) fullCols.push(c);
  }

  for (const r of fullRows) {
    for (let c = 0; c < GRID_SIZE; c++) nextB[r][c] = null;
  }
  for (const c of fullCols) {
    for (let r = 0; r < GRID_SIZE; r++) nextB[r][c] = null;
  }

  return {
    board: nextB,
    clearedCount: fullRows.length + fullCols.length,
    fullRows,
    fullCols
  };
}

function findAllValidPlacements(targetBoard, shape) {
  const placements = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (canPlaceShape(targetBoard, shape, r, c)) {
        const sim = simulatePlaceAndClear(targetBoard, shape, r, c);
        placements.push({ r, c, clearedCount: sim.clearedCount, nextBoard: sim.board });
      }
    }
  }
  return placements;
}

/**
 * THUẬT TOÁN SINH 3 KHỐI LUÔN CÓ CÁCH SẮP XẾP HỢP LÝ VỚI BẢNG
 */
function generateSolvableTray() {
  let simBoard = cloneBoard(board);
  const chosenShapes = [];

  for (let i = 0; i < 3; i++) {
    const shuffled = [...SHAPES].sort(() => Math.random() - 0.5);
    let selectedShape = null;
    let selectedSimBoard = null;

    for (const candidate of shuffled) {
      const validMoves = findAllValidPlacements(simBoard, candidate);
      if (validMoves.length > 0) {
        selectedShape = candidate;
        validMoves.sort((a, b) => b.clearedCount - a.clearedCount);
        const pickIndex = Math.random() < 0.65 ? 0 : Math.floor(Math.random() * validMoves.length);
        selectedSimBoard = validMoves[pickIndex].nextBoard;
        break;
      }
    }

    if (!selectedShape) {
      selectedShape = SHAPES[0]; // 1x1
      const moves = findAllValidPlacements(simBoard, selectedShape);
      selectedSimBoard = moves.length > 0 ? moves[0].nextBoard : simBoard;
    }

    chosenShapes.push(selectedShape);
    simBoard = selectedSimBoard;
  }

  chosenShapes.sort(() => Math.random() - 0.5);

  trayPieces = chosenShapes.map((shape, idx) => {
    const bounds = getShapeBounds(shape.cells);
    return {
      shape,
      bounds,
      used: false,
      slotIndex: idx
    };
  });
}

function ensureRemainingPiecesPlayable() {
  let simBoard = cloneBoard(board);
  for (const piece of trayPieces) {
    if (piece.used) continue;
    const moves = findAllValidPlacements(simBoard, piece.shape);
    if (moves.length === 0) {
      const shuffled = [...SHAPES].sort(() => Math.random() - 0.5);
      for (const candidate of shuffled) {
        const candidateMoves = findAllValidPlacements(simBoard, candidate);
        if (candidateMoves.length > 0) {
          piece.shape = candidate;
          piece.bounds = getShapeBounds(candidate.cells);
          simBoard = candidateMoves[0].nextBoard;
          spawnFloatingText(
            layout.traySlots[piece.slotIndex].centerX,
            layout.traySlots[piece.slotIndex].centerY,
            'Đổi khối hợp lý ✨',
            '#38bdf8'
          );
          break;
        }
      }
    } else {
      moves.sort((a, b) => b.clearedCount - a.clearedCount);
      simBoard = moves[0].nextBoard;
    }
  }
}

function isPieceGrabbedByAny(pieceIndex, excludeSide = null) {
  if (mouseDrag.grabbedPieceIndex === pieceIndex) return true;
  for (const side of ['Right', 'Left']) {
    if (side === excludeSide) continue;
    if (handsTrackers[side].grabbedPieceIndex === pieceIndex) return true;
  }
  return false;
}

function getSnapGridPosition(piece, centerX, centerY) {
  const { cellSize, boardX, boardY } = layout;
  const piecePixelW = piece.bounds.cols * cellSize;
  const piecePixelH = piece.bounds.rows * cellSize;

  const topLeftX = centerX - piecePixelW / 2;
  const topLeftY = centerY - piecePixelH / 2;

  const col = Math.round((topLeftX - boardX) / cellSize);
  const row = Math.round((topLeftY - boardY) / cellSize);

  return { row, col };
}

// --- XỬ LÝ CỬ CHỈ GẮP - DI CHUYỂN - THẢ CHO MỖI BÀN TAY (HỖ TRỢ 2 TAY CÙNG LÚC) ---
function updateSingleHandInteraction(tracker) {
  if (!tracker.detected) return;

  const px = tracker.pinchPoint.x;
  const py = tracker.pinchPoint.y;

  // 1. BẮT ĐẦU CHỤM NGÓN CÁI & TRỎ -> Chọn khối chưa có tay nào gắp
  if (tracker.isPinching && !tracker.wasPinching && tracker.grabbedPieceIndex === -1) {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < trayPieces.length; i++) {
      const piece = trayPieces[i];
      if (piece.used || isPieceGrabbedByAny(i, tracker.side)) continue;

      const slot = layout.traySlots[i];
      const dist = Math.hypot(px - slot.centerX, py - slot.centerY);
      const grabRadius = Math.max(slot.width, slot.height) * 0.68;

      if (dist < grabRadius && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1) {
      tracker.grabbedPieceIndex = bestIdx;
      tracker.dragPos.x = px;
      tracker.dragPos.y = py;
      // Xóa lịch sử hất tay khi bắt đầu gắp để tránh nhầm với hất tay reset
      tracker.swipeHistory = [];
    }
  }

  // 2. ĐANG GIỮ CHỤM & DI CHUYỂN -> Khối của tay đó di chuyển theo
  if (tracker.isPinching && tracker.grabbedPieceIndex !== -1) {
    tracker.dragPos.x = px;
    tracker.dragPos.y = py;
  }

  // 3. THẢ 2 NGÓN TAY RA -> Xếp khối của tay đó vào bảng
  if (!tracker.isPinching && tracker.wasPinching && tracker.grabbedPieceIndex !== -1) {
    const piece = trayPieces[tracker.grabbedPieceIndex];
    const { row, col } = getSnapGridPosition(piece, tracker.dragPos.x, tracker.dragPos.y);

    if (canPlaceShape(board, piece.shape, row, col)) {
      placePieceOnBoard(piece, row, col, tracker.dragPos.x, tracker.dragPos.y);
      piece.used = true;
      tracker.grabbedPieceIndex = -1;

      if (trayPieces.every(p => p.used)) {
        generateSolvableTray();
      } else {
        ensureRemainingPiecesPlayable();
      }
    } else {
      tracker.grabbedPieceIndex = -1;
    }
  }

  tracker.wasPinching = tracker.isPinching;
}

/**
 * PHÁT HIỆN CỬ CHỈ TAY PHẢI HẤT SANG ĐỂ RESET TRÒ CHƠI
 * Khi Tay Phải không đang gắp khối và thực hiện cú vẫy/hất nhanh theo chiều ngang
 */
function checkRightHandSwipeToReset(rightTracker) {
  if (!rightTracker.detected) return;

  const now = performance.now();

  // Nếu tay phải đang gắp khối hoặc đang chụm ngón thì không tính là hất reset
  if (rightTracker.grabbedPieceIndex !== -1 || rightTracker.isPinching) {
    rightTracker.swipeHistory = [];
    return;
  }

  // Lưu vết tọa độ lòng bàn tay trong 240ms gần nhất
  rightTracker.swipeHistory.push({
    x: rightTracker.palmCenter.x,
    y: rightTracker.palmCenter.y,
    t: now
  });

  while (rightTracker.swipeHistory.length > 0 && now - rightTracker.swipeHistory[0].t > 240) {
    rightTracker.swipeHistory.shift();
  }

  if (now - lastSwipeResetTime < SWIPE_RESET_COOLDOWN_MS) return;
  if (rightTracker.swipeHistory.length < 4) return;

  const first = rightTracker.swipeHistory[0];
  const last = rightTracker.swipeHistory[rightTracker.swipeHistory.length - 1];
  const dt = last.t - first.t;
  if (dt < 50) return;

  const dx = last.x - first.x;
  const dy = last.y - first.y;

  // Ngưỡng quét ngang: dịch chuyển ngang tối thiểu 20% chiều rộng màn hình trong < 240ms
  // và chuyển động chủ yếu theo phương ngang (|dx| > 2.2 * |dy|)
  const minSwipeDist = Math.max(190, canvas.width * 0.21);

  if (Math.abs(dx) >= minSwipeDist && Math.abs(dx) > Math.abs(dy) * 2.2) {
    lastSwipeResetTime = now;
    rightTracker.swipeHistory = [];
    triggerSwipeResetEffect(dx > 0 ? 'sang phải' : 'sang trái');
  }
}

function triggerSwipeResetEffect(directionLabel) {
  resetGame();
  swipeResetBanner = {
    alpha: 1.0,
    text: `👋 ĐÃ HẤT TAY PHẢI (${directionLabel.toUpperCase()}) — CHƠI LẠI!`
  };

  // Hiệu ứng hạt nổ quanh giữa bảng khi reset
  const cx = layout.boardX + layout.boardSize / 2;
  const cy = layout.boardY + layout.boardSize / 2;
  spawnFloatingText(cx, cy, '🔄 RESET TRÒ CHƠI!', '#38bdf8');
  for (let r = 0; r < GRID_SIZE; r += 2) {
    for (let c = 0; c < GRID_SIZE; c += 2) {
      spawnCellParticles(r, c, '#38bdf8');
    }
  }
}

function placePieceOnBoard(piece, startR, startC, effectX, effectY) {
  const placedCellsCount = piece.shape.cells.length;
  const sim = simulatePlaceAndClear(board, piece.shape, startR, startC);

  for (const [dr, dc] of piece.shape.cells) {
    const r = startR + dr;
    const c = startC + dc;
    cellFlashAnimations.push({ r, c, color: piece.shape.color, alpha: 0.9 });
  }

  board = sim.board;

  let gainedScore = placedCellsCount * 10;
  if (sim.clearedCount > 0) {
    combo++;
    const lineBonus = sim.clearedCount * 100 * combo;
    gainedScore += lineBonus;

    for (const r of sim.fullRows) {
      for (let c = 0; c < GRID_SIZE; c++) {
        spawnCellParticles(r, c, piece.shape.color);
      }
    }
    for (const c of sim.fullCols) {
      for (let r = 0; r < GRID_SIZE; r++) {
        spawnCellParticles(r, c, piece.shape.color);
      }
    }

    const centerBoardX = layout.boardX + layout.boardSize / 2;
    const centerBoardY = layout.boardY + layout.boardSize / 2;
    const msg = sim.clearedCount > 1
      ? `COMBO x${combo}! +${gainedScore} (${sim.clearedCount} HÀNG)`
      : `TUYỆT VỜI! +${gainedScore}`;
    spawnFloatingText(centerBoardX, centerBoardY, msg, '#fbbf24');
  } else {
    combo = 0;
    spawnFloatingText(effectX, effectY - 20, `+${gainedScore}`, '#e2e8f0');
  }

  score += gainedScore;
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('ar_blockblast_best', bestScore);
  }

  scoreEl.textContent = score;
  bestScoreEl.textContent = bestScore;
  comboEl.textContent = `x${Math.max(1, combo)}`;
}

// --- HIỆU ỨNG HẠT & CHỮ NỔI ---
function spawnCellParticles(r, c, color) {
  const cx = layout.boardX + (c + 0.5) * layout.cellSize;
  const cy = layout.boardY + (r + 0.5) * layout.cellSize;
  for (let i = 0; i < 6; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 5,
      color,
      alpha: 1
    });
  }
}

function spawnFloatingText(x, y, text, color) {
  floatingTexts.push({ x, y, text, color, alpha: 1, vy: -1.8 });
}

// --- HỖ TRỢ CHUỘT (DỰ PHÒNG) ---
canvas.addEventListener('mousedown', (e) => {
  const mx = e.clientX;
  const my = e.clientY;
  for (let i = 0; i < trayPieces.length; i++) {
    if (trayPieces[i].used || isPieceGrabbedByAny(i)) continue;
    const slot = layout.traySlots[i];
    if (Math.hypot(mx - slot.centerX, my - slot.centerY) < Math.max(slot.width, slot.height) * 0.55) {
      mouseDrag.grabbedPieceIndex = i;
      mouseDrag.pos.x = mx;
      mouseDrag.pos.y = my;
      break;
    }
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (mouseDrag.grabbedPieceIndex !== -1) {
    mouseDrag.pos.x = e.clientX;
    mouseDrag.pos.y = e.clientY;
  }
});

canvas.addEventListener('mouseup', () => {
  if (mouseDrag.grabbedPieceIndex !== -1) {
    const piece = trayPieces[mouseDrag.grabbedPieceIndex];
    const { row, col } = getSnapGridPosition(piece, mouseDrag.pos.x, mouseDrag.pos.y);
    if (canPlaceShape(board, piece.shape, row, col)) {
      placePieceOnBoard(piece, row, col, mouseDrag.pos.x, mouseDrag.pos.y);
      piece.used = true;
      mouseDrag.grabbedPieceIndex = -1;
      if (trayPieces.every(p => p.used)) {
        generateSolvableTray();
      } else {
        ensureRemainingPiecesPlayable();
      }
    } else {
      mouseDrag.grabbedPieceIndex = -1;
    }
  }
});

// --- VẼ GIAO DIỆN LÊN CANVAS ---
function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBlockCell(x, y, size, color, alpha = 1, showGrabDot = false, isGrabbed = false) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const pad = 2.5;
  const bx = x + pad;
  const by = y + pad;
  const bs = size - pad * 2;

  ctx.fillStyle = color;
  drawRoundedRect(bx, by, bs, bs, 7);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  drawRoundedRect(bx + 4, by + 4, bs - 8, (bs - 8) * 0.42, 4);
  ctx.fill();

  if (showGrabDot) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, isGrabbed ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = isGrabbed ? '#fef08a' : 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.stroke();
  }

  ctx.restore();
}

function drawDraggedPieceAndGhost(pieceIndex, dragPos, accentColor) {
  if (pieceIndex === -1) return;
  const piece = trayPieces[pieceIndex];
  if (!piece || piece.used) return;

  const { boardX, boardY, boardSize, cellSize } = layout;
  const { row, col } = getSnapGridPosition(piece, dragPos.x, dragPos.y);
  const isValid = canPlaceShape(board, piece.shape, row, col);

  // Vẽ bóng Ghost (Preview) trên bảng 8x8 nếu hợp lệ
  if (isValid) {
    for (const [dr, dc] of piece.shape.cells) {
      const gx = boardX + (col + dc) * cellSize;
      const gy = boardY + (row + dr) * cellSize;
      drawBlockCell(gx, gy, cellSize, piece.shape.color, 0.38, false, false);
    }

    const sim = simulatePlaceAndClear(board, piece.shape, row, col);
    ctx.save();
    ctx.strokeStyle = accentColor || '#fbbf24';
    ctx.lineWidth = 3;
    for (const r of sim.fullRows) {
      drawRoundedRect(boardX, boardY + r * cellSize, boardSize, cellSize, 6);
      ctx.stroke();
    }
    for (const c of sim.fullCols) {
      drawRoundedRect(boardX + c * cellSize, boardY, cellSize, boardSize, 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Vẽ khối đang di chuyển theo tay
  const pieceW = piece.bounds.cols * cellSize;
  const pieceH = piece.bounds.rows * cellSize;
  const topLeftX = dragPos.x - pieceW / 2;
  const topLeftY = dragPos.y - pieceH / 2;

  for (const [dr, dc] of piece.shape.cells) {
    drawBlockCell(
      topLeftX + dc * cellSize,
      topLeftY + dr * cellSize,
      cellSize,
      piece.shape.color,
      0.92,
      true,
      true
    );
  }
}

function renderGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. VẼ HÌNH ẢNH CAMERA NỀN (Lật gương ngang)
  if (toggleCameraBgEl.checked && videoElement.readyState >= 2) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    const vw = videoElement.videoWidth || 1280;
    const vh = videoElement.videoHeight || 720;
    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const drawW = vw * scale;
    const drawH = vh * scale;
    const offsetX = (canvas.width - drawW) / 2;
    const offsetY = (canvas.height - drawH) / 2;

    ctx.drawImage(videoElement, offsetX, offsetY, drawW, drawH);
    ctx.restore();

    ctx.fillStyle = 'rgba(11, 15, 25, 0.52)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    const grad = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 50,
      canvas.width / 2, canvas.height / 2, canvas.width
    );
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#0b0f19');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 2. VẼ BẢNG 8x8
  const { boardX, boardY, boardSize, cellSize } = layout;

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 2;
  drawRoundedRect(boardX - 8, boardY - 8, boardSize + 16, boardSize + 16, 16);
  ctx.fill();
  ctx.stroke();

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cx = boardX + c * cellSize;
      const cy = boardY + r * cellSize;

      ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      drawRoundedRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4, 6);
      ctx.fill();
      ctx.stroke();

      if (board[r][c]) {
        drawBlockCell(cx, cy, cellSize, board[r][c], 0.95, false, false);
      }
    }
  }
  ctx.restore();

  // Hiệu ứng sáng ô vừa đặt
  for (let i = cellFlashAnimations.length - 1; i >= 0; i--) {
    const f = cellFlashAnimations[i];
    const cx = boardX + f.c * cellSize;
    const cy = boardY + f.r * cellSize;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = f.alpha * 0.4;
    drawRoundedRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4, 6);
    ctx.fill();
    ctx.restore();
    f.alpha -= 0.06;
    if (f.alpha <= 0) cellFlashAnimations.splice(i, 1);
  }

  // 3. VẼ KHAY 3 KHỐI CHUẨN BỊ & CÁC CHẤM TRÒN ĐỂ GẮP
  for (let i = 0; i < trayPieces.length; i++) {
    const piece = trayPieces[i];
    const slot = layout.traySlots[i];
    const isCurrentlyGrabbed = isPieceGrabbedByAny(i);

    // Kiểm tra xem có bàn tay nào đang đưa lại gần chấm tâm khối này không
    let hoveredByTracker = null;
    if (!piece.used && !isCurrentlyGrabbed) {
      for (const side of ['Right', 'Left']) {
        const tr = handsTrackers[side];
        if (
          tr.detected &&
          tr.grabbedPieceIndex === -1 &&
          Math.hypot(tr.pinchPoint.x - slot.centerX, tr.pinchPoint.y - slot.centerY) <
            Math.max(slot.width, slot.height) * 0.62
        ) {
          hoveredByTracker = tr;
          break;
        }
      }
    }

    ctx.save();
    ctx.fillStyle = hoveredByTracker ? 'rgba(30, 58, 138, 0.65)' : 'rgba(15, 23, 42, 0.72)';
    ctx.strokeStyle = hoveredByTracker ? hoveredByTracker.accentColor : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = hoveredByTracker ? 2.5 : 1.5;
    drawRoundedRect(slot.x, slot.y, slot.width, slot.height, 14);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (piece.used || isCurrentlyGrabbed) continue;

    const maxDim = Math.max(piece.bounds.rows, piece.bounds.cols);
    const previewCellSize = Math.min(
      cellSize * 0.68,
      (Math.min(slot.width, slot.height) * 0.76) / maxDim
    );

    const totalW = piece.bounds.cols * previewCellSize;
    const totalH = piece.bounds.rows * previewCellSize;
    const startX = slot.centerX - totalW / 2;
    const startY = slot.centerY - totalH / 2;

    for (const [dr, dc] of piece.shape.cells) {
      drawBlockCell(
        startX + dc * previewCellSize,
        startY + dr * previewCellSize,
        previewCellSize,
        piece.shape.color,
        0.95,
        true,
        false
      );
    }

    // Vẽ chấm tâm gắp nổi bật ở giữa khối
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.16;
    ctx.save();
    ctx.beginPath();
    ctx.arc(slot.centerX, slot.centerY, 11 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = hoveredByTracker ? 'rgba(56, 189, 248, 0.35)' : 'rgba(255, 255, 255, 0.22)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(slot.centerX, slot.centerY, 6, 0, Math.PI * 2);
    ctx.fillStyle = hoveredByTracker ? hoveredByTracker.accentColor : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
    ctx.restore();
  }

  // 4. VẼ ĐỒNG THỜI CÁC KHỐI ĐANG ĐƯỢC GẮP BỞI TAY PHẢI, TAY TRÁI HOẶC CHUỘT
  drawDraggedPieceAndGhost(
    handsTrackers.Right.grabbedPieceIndex,
    handsTrackers.Right.dragPos,
    handsTrackers.Right.accentColor
  );
  drawDraggedPieceAndGhost(
    handsTrackers.Left.grabbedPieceIndex,
    handsTrackers.Left.dragPos,
    handsTrackers.Left.accentColor
  );
  drawDraggedPieceAndGhost(
    mouseDrag.grabbedPieceIndex,
    mouseDrag.pos,
    '#fbbf24'
  );

  // 5. VẼ CẢ 2 BÀN TAY LÊN MÀN HÌNH
  for (const side of ['Right', 'Left']) {
    if (handsTrackers[side].detected) {
      drawSingleHandOverlay(handsTrackers[side]);
    }
  }

  // 6. VẼ THÔNG BÁO KHI HẤT TAY PHẢI RESET
  if (swipeResetBanner.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, swipeResetBanner.alpha);
    const bw = 460;
    const bh = 54;
    const bx = (canvas.width - bw) / 2;
    const by = 88;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    drawRoundedRect(bx, by, bw, bh, 14);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 17px "Segoe UI", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(swipeResetBanner.text, canvas.width / 2, by + bh / 2);
    ctx.restore();

    swipeResetBanner.alpha -= 0.018;
  }

  // 7. VẼ HẠT NỔ & CHỮ ĐIỂM NỔI
  updateAndDrawParticles();
  updateAndDrawFloatingTexts();

  requestAnimationFrame(renderGame);
}

function drawSingleHandOverlay(tracker) {
  const { thumbTip, indexTip, pinchPoint, isPinching, landmarks, labelVi, accentColor, swipeHistory } = tracker;

  ctx.save();

  // Vẽ vệt lướt của Tay Phải khi di chuyển nhanh để người chơi thấy hiệu ứng hất tay
  if (tracker.side === 'Right' && swipeHistory.length > 2 && !isPinching) {
    ctx.beginPath();
    for (let i = 0; i < swipeHistory.length; i++) {
      const pt = swipeHistory[i];
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  if (landmarks) {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 2;
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 13], [13, 17], [0, 17]
    ];
    for (const [a, b] of connections) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      ctx.beginPath();
      ctx.moveTo((1 - pa.x) * canvas.width, pa.y * canvas.height);
      ctx.lineTo((1 - pb.x) * canvas.width, pb.y * canvas.height);
      ctx.stroke();
    }
  }

  // Đường nối ngón cái và ngón trỏ
  ctx.beginPath();
  ctx.moveTo(thumbTip.x, thumbTip.y);
  ctx.lineTo(indexTip.x, indexTip.y);
  ctx.strokeStyle = isPinching ? '#10b981' : accentColor;
  ctx.lineWidth = isPinching ? 4 : 2.5;
  ctx.stroke();

  // Đầu ngón cái
  ctx.beginPath();
  ctx.arc(thumbTip.x, thumbTip.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = isPinching ? '#10b981' : '#f43f5e';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Đầu ngón trỏ
  ctx.beginPath();
  ctx.arc(indexTip.x, indexTip.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = isPinching ? '#10b981' : accentColor;
  ctx.fill();
  ctx.stroke();

  // Tâm gắp giữa 2 ngón
  ctx.beginPath();
  ctx.arc(pinchPoint.x, pinchPoint.y, isPinching ? 12 : 7, 0, Math.PI * 2);
  ctx.fillStyle = isPinching ? 'rgba(16, 185, 129, 0.88)' : 'rgba(255, 255, 255, 0.8)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = isPinching ? '#ecfdf5' : '#0f172a';
  ctx.stroke();

  // Nhãn tên bàn tay (Tay Phải / Tay Trái)
  ctx.font = 'bold 12px "Segoe UI", sans-serif';
  ctx.fillStyle = isPinching ? '#10b981' : accentColor;
  ctx.textAlign = 'center';
  ctx.fillText(labelVi, pinchPoint.x, pinchPoint.y - 18);

  ctx.restore();
}

function updateAndDrawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.alpha -= 0.025;

    if (p.alpha <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function updateAndDrawFloatingTexts() {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy;
    ft.alpha -= 0.02;

    if (ft.alpha <= 0) {
      floatingTexts.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = ft.alpha;
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = ft.color;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

// --- XỬ LÝ KẾT QUẢ NHẬN DIỆN 2 BÀN TAY TỪ MEDIAPIPE ---
function updateTrackerFromLandmarks(tracker, lm) {
  tracker.landmarks = lm;

  const rawThumbX = (1 - lm[4].x) * canvas.width;
  const rawThumbY = lm[4].y * canvas.height;
  const rawIndexX = (1 - lm[8].x) * canvas.width;
  const rawIndexY = lm[8].y * canvas.height;
  const rawPalmX = (1 - lm[9].x) * canvas.width;
  const rawPalmY = lm[9].y * canvas.height;

  if (!tracker.detected) {
    tracker.thumbTip = { x: rawThumbX, y: rawThumbY };
    tracker.indexTip = { x: rawIndexX, y: rawIndexY };
    tracker.palmCenter = { x: rawPalmX, y: rawPalmY };
    tracker.pinchPoint = {
      x: (rawThumbX + rawIndexX) / 2,
      y: (rawThumbY + rawIndexY) / 2
    };
    tracker.detected = true;
  } else {
    const moveSpeed = Math.hypot(rawIndexX - tracker.indexTip.x, rawIndexY - tracker.indexTip.y);
    const dynamicAlpha = moveSpeed > 35 ? 0.92 : SMOOTH_FACTOR;

    tracker.thumbTip.x += (rawThumbX - tracker.thumbTip.x) * dynamicAlpha;
    tracker.thumbTip.y += (rawThumbY - tracker.thumbTip.y) * dynamicAlpha;
    tracker.indexTip.x += (rawIndexX - tracker.indexTip.x) * dynamicAlpha;
    tracker.indexTip.y += (rawIndexY - tracker.indexTip.y) * dynamicAlpha;
    tracker.palmCenter.x += (rawPalmX - tracker.palmCenter.x) * dynamicAlpha;
    tracker.palmCenter.y += (rawPalmY - tracker.palmCenter.y) * dynamicAlpha;

    tracker.pinchPoint.x = (tracker.thumbTip.x + tracker.indexTip.x) / 2;
    tracker.pinchPoint.y = (tracker.thumbTip.y + tracker.indexTip.y) / 2;
  }

  const handSize = Math.hypot(
    (lm[0].x - lm[9].x) * canvas.width,
    (lm[0].y - lm[9].y) * canvas.height
  );
  const pinchDist = Math.hypot(
    tracker.thumbTip.x - tracker.indexTip.x,
    tracker.thumbTip.y - tracker.indexTip.y
  );

  const pinchStartThreshold = Math.max(46, handSize * 0.43);
  const pinchReleaseThreshold = Math.max(56, handSize * 0.50);

  if (!tracker.isPinching && pinchDist < pinchStartThreshold) {
    tracker.isPinching = true;
  } else if (tracker.isPinching && pinchDist > pinchReleaseThreshold) {
    tracker.isPinching = false;
  }
}

function onHandResults(results) {
  const seenSides = { Right: false, Left: false };

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const count = results.multiHandLandmarks.length;

    // Nếu có 2 bàn tay xuất hiện cùng lúc, phân loại bên Trái / bên Phải theo vị trí ngang trên màn hình gương
    // kết hợp với nhãn MediaPipe để không bao giờ bị trùng 2 tay vào 1 bên
    if (count >= 2) {
      const lm0 = results.multiHandLandmarks[0];
      const lm1 = results.multiHandLandmarks[1];
      const x0 = (1 - lm0[0].x) * canvas.width;
      const x1 = (1 - lm1[0].x) * canvas.width;

      if (x0 >= x1) {
        updateTrackerFromLandmarks(handsTrackers.Right, lm0);
        updateTrackerFromLandmarks(handsTrackers.Left, lm1);
      } else {
        updateTrackerFromLandmarks(handsTrackers.Right, lm1);
        updateTrackerFromLandmarks(handsTrackers.Left, lm0);
      }
      seenSides.Right = true;
      seenSides.Left = true;
    } else {
      // Khi có 1 bàn tay: Trong video gốc chưa lật gửi vào MediaPipe,
      // tay phải thực tế của người chơi được MediaPipe trả về label === 'Left'
      const lm = results.multiHandLandmarks[0];
      const rawLabel = results.multiHandedness?.[0]?.label || 'Left';
      const userRealSide = rawLabel === 'Left' ? 'Right' : 'Left';

      updateTrackerFromLandmarks(handsTrackers[userRealSide], lm);
      seenSides[userRealSide] = true;
    }
  }

  for (const side of ['Right', 'Left']) {
    if (!seenSides[side]) {
      handsTrackers[side].detected = false;
      handsTrackers[side].isPinching = false;
      handsTrackers[side].wasPinching = false;
      handsTrackers[side].grabbedPieceIndex = -1;
      handsTrackers[side].swipeHistory = [];
    } else {
      updateSingleHandInteraction(handsTrackers[side]);
    }
  }

  // Kiểm tra cử chỉ Tay Phải hất ngang để Reset trò chơi
  if (seenSides.Right) {
    checkRightHandSwipeToReset(handsTrackers.Right);
  }

  // Cập nhật thanh trạng thái
  const activeHands = ['Right', 'Left'].filter(s => seenSides[s]);
  if (activeHands.length > 0) {
    camDotEl.className = 'dot active';
    const grabbingHands = activeHands.filter(s => handsTrackers[s].grabbedPieceIndex !== -1);
    if (grabbingHands.length === 2) {
      statusTextEl.textContent = '🙌 Đang dùng 2 tay gắp 2 khối cùng lúc! Mở ngón để đặt lên bảng.';
    } else if (grabbingHands.length === 1) {
      const hName = handsTrackers[grabbingHands[0]].labelVi;
      statusTextEl.textContent = `👌 ${hName} đang gắp khối (Tay kia có thể gắp thêm khối thứ 2!)`;
    } else {
      statusTextEl.textContent = `🖐️ Đã nhận diện ${activeHands.length} tay — Chụm ngón để gắp khối hoặc Hất ngang Tay Phải để Reset`;
    }
  } else {
    camDotEl.className = 'dot loading';
    statusTextEl.textContent = 'Đưa 1 hoặc 2 bàn tay lên trước Camera để điều khiển...';
  }
}

async function initCameraAndHandTracking() {
  try {
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55
    });

    hands.onResults(onHandResults);

    const camera = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 640,
      height: 480
    });

    await camera.start();
    camDotEl.className = 'dot active';
    statusTextEl.textContent = 'Camera đã sẵn sàng! Hỗ trợ cả 2 tay cùng lúc.';
  } catch (err) {
    console.error('Lỗi khởi tạo Camera:', err);
    camDotEl.className = 'dot error';
    statusTextEl.textContent =
      'Không thể mở Camera (hãy cấp quyền trên trình duyệt hoặc dùng chuột kéo thả).';
  }
}

function resetGame() {
  board = createEmptyBoard();
  score = 0;
  combo = 0;
  mouseDrag.grabbedPieceIndex = -1;
  handsTrackers.Right.grabbedPieceIndex = -1;
  handsTrackers.Left.grabbedPieceIndex = -1;
  scoreEl.textContent = '0';
  comboEl.textContent = 'x1';
  generateSolvableTray();
}

resetBtn.addEventListener('click', resetGame);

// --- KHỞI CHẠY ỨNG DỤNG ---
resizeCanvas();
resetGame();
requestAnimationFrame(renderGame);
initCameraAndHandTracking();
