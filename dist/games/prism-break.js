// PRISM BREAK: ブロック崩し（3ステージ・3ライフ）
import { clamp } from "../core/input.js";

const W = 480, H = 640;
const PADDLE_W = 92, PADDLE_H = 14, PADDLE_Y = 586;
const BALL_R = 7;
const BRICK_COLS = 10, BRICK_W = 44, BRICK_H = 18, BRICK_Y = 72, BRICK_GAP = 4;
const ROW_COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#c084fc", "#f472b6", "#a3e635"];

// パドルの当たった位置 (-1..1) から反射ベクトルを求める
export function paddleBounce(offset, speed) {
  const o = clamp(offset, -1, 1);
  const angle = o * (Math.PI / 3); // 最大60度
  return { vx: Math.sin(angle) * speed, vy: -Math.cos(angle) * speed };
}

export function circleHitsRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

export function buildStage(stage) {
  const bricks = [];
  const rows = stage === 1 ? 6 : 7;
  const totalW = BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP;
  const startX = (W - totalW) / 2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < BRICK_COLS; c++) {
    let hp = 0;
    if (stage === 1) hp = 1;
    else if (stage === 2) hp = (r + c) % 2 === 0 ? 1 : 2;
    else {
      const centerDist = Math.abs(c - 4.5);
      if (r === 0 || r === rows - 1) hp = 2;
      else if (centerDist <= (rows - r) / 2) hp = 2;
      else hp = 1;
      if (r === 3 && (c === 0 || c === 9)) hp = 0; // 両端に抜け穴
    }
    if (!hp) continue;
    bricks.push({
      x: startX + c * (BRICK_W + BRICK_GAP),
      y: BRICK_Y + r * (BRICK_H + BRICK_GAP),
      w: BRICK_W, h: BRICK_H, hp, maxHp: hp,
      color: ROW_COLORS[r % ROW_COLORS.length], alive: true,
    });
  }
  return bricks;
}

export function createPrismBreak(hooks) {
  let paddleX, ball, bricks, score, lives, stage, launched, over, message, messageTime;
  let pointerX = null;
  const touch = { left: false, right: false };

  function ballSpeed() { return 330 + (stage - 1) * 45; }
  function stickBall() {
    ball = { x: paddleX, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0 };
    launched = false;
  }
  function loadStage(n) {
    stage = n;
    bricks = buildStage(n);
    paddleX = W / 2;
    stickBall();
    hooks.onHudChange?.();
  }
  function reset() {
    score = 0; lives = 3; over = false; message = ""; messageTime = 0;
    pointerX = null; touch.left = touch.right = false;
    loadStage(1);
    hooks.onScore(score);
  }
  function launch() {
    if (over || launched) return;
    const v = paddleBounce((Math.random() * 0.4 - 0.2), ballSpeed());
    ball.vx = v.vx; ball.vy = v.vy; launched = true;
    hooks.play("launch");
  }

  function stepBall(dt) {
    // トンネリング防止のため小刻みに進める
    const dist = Math.hypot(ball.vx, ball.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / (BALL_R * 0.9)));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      ball.x += ball.vx * sdt;
      ball.y += ball.vy * sdt;
      if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); hooks.play("bounce"); }
      if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); hooks.play("bounce"); }
      if (ball.y < BALL_R + 8) { ball.y = BALL_R + 8; ball.vy = Math.abs(ball.vy); hooks.play("bounce"); }
      // パドル
      const pr = { x: paddleX - PADDLE_W / 2, y: PADDLE_Y, w: PADDLE_W, h: PADDLE_H };
      if (ball.vy > 0 && circleHitsRect(ball.x, ball.y, BALL_R, pr)) {
        const offset = (ball.x - paddleX) / (PADDLE_W / 2);
        const v = paddleBounce(offset, Math.hypot(ball.vx, ball.vy));
        ball.vx = v.vx; ball.vy = v.vy;
        ball.y = PADDLE_Y - BALL_R - 0.5;
        hooks.play("bounce");
      }
      // ブロック（1サブステップにつき最大1個だけ処理し、二重加点しない）
      for (const b of bricks) {
        if (!b.alive) continue;
        if (!circleHitsRect(ball.x, ball.y, BALL_R, b)) continue;
        const prevX = ball.x - ball.vx * sdt, prevY = ball.y - ball.vy * sdt;
        const wasXInside = prevX >= b.x - BALL_R && prevX <= b.x + b.w + BALL_R;
        const wasYInside = prevY >= b.y - BALL_R && prevY <= b.y + b.h + BALL_R;
        if (wasYInside && !wasXInside) ball.vx = -ball.vx;
        else if (wasXInside && !wasYInside) ball.vy = -ball.vy;
        else ball.vy = -ball.vy;
        b.hp -= 1;
        if (b.hp <= 0) { b.alive = false; score += 50; }
        else score += 20;
        hooks.onScore(score);
        hooks.play("brick");
        break;
      }
      // 落下
      if (ball.y - BALL_R > H) {
        lives -= 1;
        hooks.onHudChange?.();
        hooks.play("hurt");
        if (lives <= 0) {
          over = true; hooks.play("lose");
          hooks.onGameOver({ score, win: false, detail: `ステージ ${stage} 到達` });
        } else {
          message = `ミス! 残りライフ ${lives}`; messageTime = 1.4;
          stickBall();
        }
        return;
      }
    }
    // ステージクリア判定
    if (!over && bricks.every((b) => !b.alive)) {
      if (stage >= 3) {
        score += lives * 200;
        hooks.onScore(score);
        over = true; hooks.play("win");
        hooks.onGameOver({ score, win: true, detail: `全ステージ制覇 / 残りライフ ${lives}` });
      } else {
        score += 300; hooks.onScore(score);
        message = `ステージ ${stage} クリア!`; messageTime = 1.6;
        hooks.play("win");
        loadStage(stage + 1);
      }
    }
  }

  function update(dt, kb) {
    if (over) return;
    if (messageTime > 0) messageTime -= dt;
    const speed = 460;
    const left = kb.isDown("ArrowLeft") || touch.left;
    const right = kb.isDown("ArrowRight") || touch.right;
    if (left || right) pointerX = null;
    if (left) paddleX -= speed * dt;
    if (right) paddleX += speed * dt;
    if (pointerX !== null) paddleX += (pointerX - paddleX) * Math.min(1, dt * 18);
    paddleX = clamp(paddleX, PADDLE_W / 2 + 4, W - PADDLE_W / 2 - 4);
    if (!launched) { ball.x = paddleX; ball.y = PADDLE_Y - BALL_R - 1; return; }
    stepBall(dt);
  }

  function handlePressed(code) {
    if (code === "Space") launch();
  }
  function touchAction(action, down) {
    if (down && (action === "left" || action === "right")) pointerX = null;
    if (action === "left") touch.left = down;
    else if (action === "right") touch.right = down;
    else if (action === "launch" && down) launch();
  }
  function handlePointer(x, y, type) {
    if (type === "up") { pointerX = null; return; }
    pointerX = clamp(x, 0, W);
    if (type === "down") launch();
  }

  function clearInput() {
    touch.left = touch.right = false;
    pointerX = null;
  }

  function draw(ctx) {
    ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(96,165,250,0.10)"; ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, H); ctx.stroke(); }
    ctx.fillStyle = "#e8f6d8"; ctx.font = "bold 15px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("PRISM BREAK", 16, 28);
    ctx.fillStyle = "#9fb4e8"; ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`ステージ ${stage}/3`, 16, 48);
    ctx.textAlign = "right";
    ctx.fillText(`ライフ ${"●".repeat(Math.max(0, lives))}`, W - 16, 28);
    ctx.fillText(`残り ${bricks.filter((b) => b.alive).length}`, W - 16, 48);
    ctx.textAlign = "left";
    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      ctx.globalAlpha = b.hp === 1 && b.maxHp > 1 ? 0.55 : 1;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, 3);
      ctx.strokeStyle = "rgba(5,8,20,0.8)";
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      if (b.maxHp > 1) {
        ctx.fillStyle = "rgba(5,8,20,0.6)";
        ctx.font = "bold 9px system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(String(b.hp), b.x + b.w / 2, b.y + b.h - 4);
        ctx.textAlign = "left";
      }
    }
    // パドル
    ctx.fillStyle = "#bef264";
    ctx.fillRect(paddleX - PADDLE_W / 2, PADDLE_Y, PADDLE_W, PADDLE_H);
    ctx.fillStyle = "#365314";
    ctx.fillRect(paddleX - PADDLE_W / 2 + 4, PADDLE_Y + 4, PADDLE_W - 8, 3);
    // ボール
    ctx.fillStyle = "#f0fdff";
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 2; ctx.stroke();
    if (!launched && !over) {
      ctx.fillStyle = "#e8f6d8"; ctx.font = "bold 16px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Space / タップで発射", W / 2, PADDLE_Y - 44);
      ctx.textAlign = "left";
    }
    if (messageTime > 0) {
      ctx.fillStyle = "#bef264"; ctx.font = "bold 22px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(message, W / 2, H / 2);
      ctx.textAlign = "left";
    }
  }

  return {
    logicalSize: { w: W, h: H },
    reset, update, draw, handlePressed, touchAction, handlePointer, clearInput,
    getSnapshot() {
      return {
        score, lives, stage, launched, over,
        paddleX: Math.round(paddleX),
        ball: { x: Math.round(ball.x), y: Math.round(ball.y) },
        bricksAlive: bricks.filter((b) => b.alive).length,
      };
    },
    hud() {
      return [
        { label: "スコア", value: String(score) },
        { label: "ステージ", value: `${stage}/3` },
        { label: "ライフ", value: String(lives) },
      ];
    },
  };
}
