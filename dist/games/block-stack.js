// BLOCK STACK: 10x20 落ちものパズル（7種1巡・ホールド・ゴースト付き）
export const COLS = 10;
export const ROWS = 20;

export const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
};

export const PIECE_COLORS = {
  I: "#22d3ee", O: "#facc15", T: "#c084fc", S: "#4ade80",
  Z: "#f87171", J: "#60a5fa", L: "#fb923c",
};

const TYPES = Object.keys(SHAPES);
const KICKS = [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[-1,-1],[1,-1],[0,1]];
const LINE_SCORES = [0, 100, 300, 500, 800];

export function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

export function rotateMatrix(m, dir) {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (dir > 0) out[x][n - 1 - y] = m[y][x];
    else out[n - 1 - x][y] = m[y][x];
  }
  return out;
}

export function canPlace(board, matrix, px, py) {
  for (let y = 0; y < matrix.length; y++) for (let x = 0; x < matrix[y].length; x++) {
    if (!matrix[y][x]) continue;
    const bx = px + x, by = py + y;
    if (bx < 0 || bx >= COLS || by >= ROWS) return false;
    if (by >= 0 && board[by][bx]) return false;
  }
  return true;
}

export function clearFullLines(board) {
  const kept = board.filter((row) => row.some((c) => !c));
  const cleared = ROWS - kept.length;
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
  return { board: kept, cleared };
}

export function createBag(random = Math.random) {
  const bag = TYPES.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function gravityInterval(level) {
  return Math.max(0.07, 0.8 * Math.pow(0.82, level - 1));
}

const W = 400, H = 560;
const CELL = 24, BX = 16, BY = 40;

export function createBlockStack(hooks) {
  let board, current, queue, hold, canHold, score, lines, level;
  let dropAcc, lockAcc, lockResets, over;
  let dasDir = 0, dasTime = 0, arrTime = 0;
  const touch = { left: false, right: false, down: false };
  let flashRows = [], flashTime = 0;

  function nextType() {
    if (queue.length < 7) queue.push(...createBag());
    return queue.shift();
  }
  function spawn(type) {
    const matrix = SHAPES[type].map((r) => r.slice());
    const x = Math.floor((COLS - matrix.length) / 2);
    const y = type === "I" ? -1 : 0;
    current = { type, matrix, x, y };
    dropAcc = 0; lockAcc = 0; lockResets = 0;
    if (!canPlace(board, matrix, x, y)) {
      over = true;
      hooks.play("lose");
      hooks.onGameOver({ score, win: false, detail: `${lines} ライン / Lv.${level}` });
    }
  }
  function reset() {
    board = createEmptyBoard();
    queue = []; hold = null; canHold = true;
    score = 0; lines = 0; level = 1; over = false;
    flashRows = []; flashTime = 0;
    dasDir = 0; dasTime = 0; arrTime = 0;
    touch.left = touch.right = touch.down = false;
    spawn(nextType());
    hooks.onScore(score);
  }

  function grounded() {
    return !canPlace(board, current.matrix, current.x, current.y + 1);
  }
  function noteMoved() {
    if (grounded() && lockResets < 15) { lockAcc = 0; lockResets++; }
  }
  function tryMove(dx, dy) {
    if (over || !current) return false;
    if (canPlace(board, current.matrix, current.x + dx, current.y + dy)) {
      current.x += dx; current.y += dy;
      if (dx !== 0) noteMoved();
      return true;
    }
    return false;
  }
  function tryRotate(dir) {
    if (over || !current || current.type === "O") return;
    const rotated = rotateMatrix(current.matrix, dir);
    for (const [kx, ky] of KICKS) {
      if (canPlace(board, rotated, current.x + kx, current.y + ky)) {
        current.matrix = rotated; current.x += kx; current.y += ky;
        noteMoved(); hooks.play("rotate");
        return;
      }
    }
  }
  function ghostY() {
    let y = current.y;
    while (canPlace(board, current.matrix, current.x, y + 1)) y++;
    return y;
  }
  function lockPiece() {
    const { matrix, x, y, type } = current;
    for (let r = 0; r < matrix.length; r++) for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const by = y + r, bx = x + c;
      if (by < 0) {
        over = true; hooks.play("lose");
        hooks.onGameOver({ score, win: false, detail: `${lines} ライン / Lv.${level}` });
        return;
      }
      board[by][bx] = type;
    }
    hooks.play("lock");
    const full = [];
    board.forEach((row, i) => { if (row.every((c) => c)) full.push(i); });
    if (full.length) {
      const res = clearFullLines(board);
      board = res.board;
      lines += res.cleared;
      score += LINE_SCORES[res.cleared] * level;
      level = Math.floor(lines / 10) + 1;
      flashRows = full; flashTime = 0.18;
      hooks.play(res.cleared >= 4 ? "bigClear" : "clear");
      hooks.onScore(score);
    }
    canHold = true;
    spawn(nextType());
  }
  function hardDrop() {
    if (over || !current) return;
    const gy = ghostY();
    score += (gy - current.y) * 2;
    current.y = gy;
    hooks.onScore(score);
    lockPiece();
  }
  function doHold() {
    if (over || !canHold || !current) return;
    const cur = current.type;
    if (hold === null) { hold = cur; spawn(nextType()); }
    else { const h = hold; hold = cur; spawn(h); }
    canHold = false;
    hooks.play("rotate");
  }

  function update(dt, kb) {
    if (over) return;
    if (flashTime > 0) flashTime -= dt;
    // 横移動（DAS/ARR）
    const left = kb.isDown("ArrowLeft") || touch.left;
    const right = kb.isDown("ArrowRight") || touch.right;
    const dir = left && !right ? -1 : right && !left ? 1 : 0;
    if (dir !== dasDir) {
      dasDir = dir; dasTime = 0; arrTime = 0;
      if (dir !== 0 && tryMove(dir, 0)) hooks.play("move");
    } else if (dir !== 0) {
      dasTime += dt;
      if (dasTime >= 0.16) {
        arrTime += dt;
        while (arrTime >= 0.05) { arrTime -= 0.05; tryMove(dir, 0); }
      }
    }
    const soft = kb.isDown("ArrowDown") || touch.down;
    const interval = soft ? 0.03 : gravityInterval(level);
    dropAcc += dt;
    while (dropAcc >= interval) {
      dropAcc -= interval;
      if (canPlace(board, current.matrix, current.x, current.y + 1)) {
        current.y++;
        if (soft) { score += 1; hooks.onScore(score); }
      } else break;
    }
    if (grounded()) {
      lockAcc += dt;
      if (lockAcc >= 0.5) lockPiece();
    } else lockAcc = 0;
  }

  function handlePressed(code) {
    if (over) return;
    if (code === "ArrowUp" || code === "KeyX") tryRotate(1);
    else if (code === "KeyZ") tryRotate(-1);
    else if (code === "Space") hardDrop();
    else if (code === "KeyC") doHold();
  }

  function touchAction(action, down) {
    if (action === "left") touch.left = down;
    else if (action === "right") touch.right = down;
    else if (action === "down") touch.down = down;
    else if (!down) return;
    else if (action === "rotate") tryRotate(1);
    else if (action === "rotateCCW") tryRotate(-1);
    else if (action === "drop") hardDrop();
    else if (action === "hold") doHold();
  }

  function clearInput() {
    touch.left = touch.right = touch.down = false;
    dasDir = 0; dasTime = 0; arrTime = 0;
  }

  function drawCell(ctx, gx, gy, type, ghost = false) {
    const x = BX + gx * CELL, y = BY + gy * CELL;
    if (y < BY) return;
    const color = PIECE_COLORS[type];
    ctx.fillStyle = ghost ? "rgba(255,255,255,0.10)" : color;
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    ctx.strokeStyle = ghost ? color : "rgba(5,8,20,0.85)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
    if (!ghost) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x + 3, y + 3, CELL - 6, 4);
      ctx.fillStyle = "rgba(5,8,20,0.55)";
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(type, x + CELL / 2, y + CELL / 2 + 2);
    }
  }
  function drawMini(ctx, type, cx, cy, cell, dim) {
    if (!type) return;
    const m = SHAPES[type];
    const w = m[0].length * cell, h = m.length * cell;
    ctx.globalAlpha = dim ? 0.35 : 1;
    for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      ctx.fillStyle = PIECE_COLORS[type];
      ctx.fillRect(cx - w / 2 + c * cell + 1, cy - h / 2 + r * cell + 1, cell - 2, cell - 2);
      ctx.strokeStyle = "rgba(5,8,20,0.8)";
      ctx.strokeRect(cx - w / 2 + c * cell + 1.5, cy - h / 2 + r * cell + 1.5, cell - 3, cell - 3);
    }
    ctx.globalAlpha = 1;
  }

  function draw(ctx) {
    ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#e8f6d8"; ctx.font = "bold 15px system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText("BLOCK STACK", BX, 26);
    ctx.fillStyle = "#121a33"; ctx.fillRect(BX, BY, COLS * CELL, ROWS * CELL);
    ctx.strokeStyle = "rgba(148,190,255,0.14)"; ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(BX + x * CELL, BY); ctx.lineTo(BX + x * CELL, BY + ROWS * CELL); ctx.stroke(); }
    for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(BX, BY + y * CELL); ctx.lineTo(BX + COLS * CELL, BY + y * CELL); ctx.stroke(); }
    ctx.strokeStyle = "#3b4a7a"; ctx.lineWidth = 2;
    ctx.strokeRect(BX, BY, COLS * CELL, ROWS * CELL);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (board[r][c]) drawCell(ctx, c, r, board[r][c]);
    }
    if (flashTime > 0) {
      ctx.fillStyle = "rgba(190,242,100,0.35)";
      for (const r of flashRows) ctx.fillRect(BX, BY + r * CELL, COLS * CELL, 3);
    }
    if (current && !over) {
      const gy = ghostY();
      const { matrix, x, type } = current;
      for (let r = 0; r < matrix.length; r++) for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) drawCell(ctx, x + c, gy + r, type, true);
      }
      for (let r = 0; r < matrix.length; r++) for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) drawCell(ctx, x + c, current.y + r, type);
      }
    }
    const px = 272;
    ctx.fillStyle = "#9fb4e8"; ctx.font = "bold 11px system-ui, sans-serif";
    ctx.fillText("NEXT", px, BY + 12);
    ctx.fillStyle = "#121a33"; ctx.fillRect(px, BY + 20, 96, 64);
    ctx.strokeStyle = "#3b4a7a"; ctx.strokeRect(px, BY + 20, 96, 64);
    drawMini(ctx, queue[0], px + 48, BY + 52, 13, false);
    ctx.fillStyle = "#9fb4e8"; ctx.fillText("HOLD (C)", px, BY + 116);
    ctx.fillStyle = "#121a33"; ctx.fillRect(px, BY + 124, 96, 64);
    ctx.strokeStyle = "#3b4a7a"; ctx.strokeRect(px, BY + 124, 96, 64);
    drawMini(ctx, hold, px + 48, BY + 156, 13, !canHold);
    ctx.fillStyle = "#e8f6d8"; ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText(`Lv.${level}`, px, BY + 224);
    ctx.font = "12px system-ui, sans-serif"; ctx.fillStyle = "#9fb4e8";
    ctx.fillText(`${lines} ライン`, px, BY + 246);
    ctx.fillText("←→ 移動 / ↑ 回転", px, BY + 300);
    ctx.fillText("Space 落下", px, BY + 320);
  }

  return {
    logicalSize: { w: W, h: H },
    reset, update, draw, handlePressed, touchAction, clearInput,
    handlePointer() {},
    getSnapshot() {
      return {
        score, lines, level, over,
        current: current ? current.type : null,
        next: queue[0] ?? null, hold, canHold,
        filledCells: board.flat().filter(Boolean).length,
      };
    },
    hud() {
      return [
        { label: "スコア", value: String(score) },
        { label: "レベル", value: String(level) },
        { label: "ライン", value: String(lines) },
      ];
    },
  };
}
