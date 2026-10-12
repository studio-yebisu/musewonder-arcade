// MIDNIGHT RUN: 疑似3Dアーケードレース（3000m / 80秒）
import { clamp } from "../core/input.js";

const W = 480, H = 640;
const HORIZON = 196;
export const GOAL_M = 3000;
export const TIME_LIMIT = 80;
export const MAX_SPEED = 58; // m/s
const SEG_LEN = 8;
const DRAW_SEGS = 56;
const PERSP_K = 42;

export function curveAt(z) {
  return 1.5 * Math.sin(z * 0.0016) + 1.05 * Math.sin(z * 0.00043 + 1.7);
}

export function isColliding(playerZ, playerX, car) {
  return Math.abs(car.z - playerZ) < 9 && Math.abs(car.lane - playerX) < 0.38;
}

export function project(relZ) {
  const t = PERSP_K / (PERSP_K + Math.max(0.1, relZ));
  return {
    t,
    y: HORIZON + (H - HORIZON) * t,
    halfW: 8 + 196 * t,
  };
}

const CAR_COLORS = ["#f87171", "#60a5fa", "#facc15", "#e879f9", "#94a3b8", "#fb923c"];

export function createMidnightRun(hooks) {
  let dist, speed, playerX, steerVis, cars, score, elapsed, over;
  let spawnAcc, shake, crashCool, finished;
  const touch = { left: false, right: false, up: false, down: false };

  function reset() {
    dist = 0; speed = 0; playerX = 0; steerVis = 0;
    cars = []; score = 0; elapsed = 0; over = false; finished = false;
    spawnAcc = 0; shake = 0; crashCool = 0;
    touch.left = touch.right = touch.up = touch.down = false;
    for (let i = 0; i < 5; i++) spawnCar(260 + i * 150);
    hooks.onScore(score);
  }
  function spawnCar(z) {
    if (cars.length >= 14) return;
    const lanes = [-0.62, 0, 0.62];
    cars.push({
      z, lane: lanes[Math.floor(Math.random() * 3)],
      speed: 17 + Math.random() * 11,
      color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      hit: false, nearMissed: false,
    });
  }
  function finish(win) {
    over = true; finished = win;
    if (win) {
      score += Math.round(Math.max(0, TIME_LIMIT - elapsed)) * 50 + 1000;
      hooks.onScore(score);
      hooks.play("win");
      hooks.onGameOver({ score, win: true, detail: `ゴール! ${elapsed.toFixed(1)} 秒` });
    } else {
      hooks.play("lose");
      hooks.onGameOver({ score, win: false, detail: `時間切れ あと ${Math.max(0, Math.round(GOAL_M - dist))} m` });
    }
  }

  function update(dt, kb) {
    if (over) return;
    elapsed += dt;
    if (shake > 0) shake -= dt;
    if (crashCool > 0) crashCool -= dt;
    const up = kb.isDown("ArrowUp") || kb.isDown("KeyW") || touch.up;
    const down = kb.isDown("ArrowDown") || kb.isDown("KeyS") || touch.down;
    const offRoad = Math.abs(playerX) > 1;
    if (down) speed -= 30 * dt;
    else if (up) speed += 15 * dt;
    else {
      // 操作なしでも巡航速度まで緩やかに加速する（スマホ向け）
      const cruise = 30;
      speed += clamp(cruise - speed, -8 * dt * 8, 7 * dt * 8) * 0.9;
    }
    if (offRoad && speed > 18) speed -= 22 * dt;
    speed = clamp(speed, 0, MAX_SPEED);
    // ステアリング（速度が上がるほど効く）
    const steerPower = 1.9 * clamp(speed / MAX_SPEED, 0.15, 1);
    let steer = 0;
    if (kb.isDown("ArrowLeft") || kb.isDown("KeyA") || touch.left) steer -= 1;
    if (kb.isDown("ArrowRight") || kb.isDown("KeyD") || touch.right) steer += 1;
    playerX += steer * steerPower * dt;
    steerVis += (steer - steerVis) * Math.min(1, dt * 10);
    // カーブの遠心力で外側へ流れる
    playerX -= curveAt(dist) * (speed / MAX_SPEED) * dt * 0.42;
    playerX = clamp(playerX, -1.7, 1.7);
    const previousDistance = dist;
    dist += speed * dt;
    score += Math.floor(dist) - Math.floor(previousDistance);
    // 交通
    spawnAcc += dt;
    if (spawnAcc > 1.05) { spawnAcc = 0; spawnCar(dist + 480 + Math.random() * 220); }
    for (const c of cars) {
      c.z += c.speed * dt;
      if (!c.hit && crashCool <= 0 && isColliding(dist, playerX, c)) {
        c.hit = true; crashCool = 1.1; shake = 0.5;
        speed = Math.min(speed, 13);
        score = Math.max(0, score - 120);
        playerX += playerX <= c.lane ? -0.35 : 0.35;
        hooks.play("crash");
      }
      if (!c.nearMissed && !c.hit && c.z < dist - 6 && Math.abs(c.lane - playerX) < 0.72) {
        c.nearMissed = true; score += 150; hooks.play("nearMiss");
      }
    }
    cars = cars.filter((c) => c.z > dist - 40 && c.z < dist + 900);
    hooks.onScore(score);
    if (dist >= GOAL_M) finish(true);
    else if (elapsed >= TIME_LIMIT) finish(false);
  }

  function handlePressed() {}
  function touchAction(action, down) {
    if (action in touch) touch[action] = down;
  }
  function handlePointer() {}

  function clearInput() {
    touch.left = touch.right = touch.up = touch.down = false;
  }

  function roadPoints() {
    const pts = [];
    let offset = 0, dx = 0;
    const baseSeg = Math.floor(dist / SEG_LEN);
    const frac = (dist % SEG_LEN) / SEG_LEN;
    for (let i = 0; i <= DRAW_SEGS; i++) {
      const segZ = (baseSeg + i) * SEG_LEN;
      const relZ = segZ - dist + SEG_LEN;
      const p = project(relZ);
      const center = W / 2 + offset - playerX * p.halfW;
      pts.push({ seg: baseSeg + i, z: segZ, relZ, y: p.y, halfW: p.halfW, center, curve: curveAt(segZ) });
      dx += curveAt(segZ) * 0.55;
      offset += dx * (p.t * 1.15);
    }
    void frac;
    return pts;
  }

  function drawCar(ctx, cx, baseY, w, color, isPlayer) {
    const h = w * 0.52;
    const y = baseY - h;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath(); ctx.ellipse(cx, baseY, w * 0.55, h * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111827";
    ctx.fillRect(cx - w * 0.5, y + h * 0.62, w * 0.16, h * 0.38);
    ctx.fillRect(cx + w * 0.34, y + h * 0.62, w * 0.16, h * 0.38);
    ctx.fillStyle = color;
    ctx.fillRect(cx - w * 0.5, y + h * 0.34, w, h * 0.5);
    ctx.fillRect(cx - w * 0.34, y, w * 0.68, h * 0.44);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(cx - w * 0.28, y + h * 0.07, w * 0.56, h * 0.26);
    ctx.fillStyle = isPlayer ? "#fef08a" : "#fca5a5";
    ctx.fillRect(cx - w * 0.44, y + h * 0.52, w * 0.16, h * 0.13);
    ctx.fillRect(cx + w * 0.28, y + h * 0.52, w * 0.16, h * 0.13);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(cx - w * 0.5, y + h * 0.34, w, Math.max(1, h * 0.05));
  }

  function draw(ctx) {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6);
    // 空と街並み
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON + 30);
    sky.addColorStop(0, "#070b1f"); sky.addColorStop(0.7, "#14224d"); sky.addColorStop(1, "#3b2f5e");
    ctx.fillStyle = sky; ctx.fillRect(-12, -12, W + 24, HORIZON + 42);
    ctx.fillStyle = "#fef9c3";
    ctx.beginPath(); ctx.arc(392, 62, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#070b1f";
    ctx.beginPath(); ctx.arc(402, 56, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#cbd5e1";
    for (let i = 0; i < 36; i++) {
      const sx = (i * 97) % W, sy = (i * 53) % 150;
      ctx.globalAlpha = 0.35 + ((i * 7) % 10) / 18;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
    const par = -playerX * 14 - curveAt(dist) * 8;
    ctx.fillStyle = "#0d1633";
    for (let i = 0; i < 9; i++) {
      const bw = 52, bx = ((i * 67 + par) % (W + 80) + W + 80) % (W + 80) - 40;
      const bh = 34 + ((i * 37) % 52);
      ctx.fillRect(bx, HORIZON - bh, bw, bh);
      ctx.fillStyle = "#fde68a";
      for (let wy = 0; wy < 3; wy++) for (let wx = 0; wx < 3; wx++) {
        if ((i + wx + wy) % 3) ctx.fillRect(bx + 7 + wx * 15, HORIZON - bh + 7 + wy * 13, 5, 6);
      }
      ctx.fillStyle = "#0d1633";
    }
    ctx.fillStyle = "#131f42"; ctx.fillRect(-12, HORIZON, W + 24, H - HORIZON + 12);
    // 道路
    const pts = roadPoints();
    for (let i = pts.length - 2; i >= 0; i--) {
      const a = pts[i], b = pts[i + 1];
      const alt = Math.floor(a.seg / 3) % 2 === 0;
      ctx.fillStyle = alt ? "#182a57" : "#15234a";
      ctx.fillRect(-12, b.y, W + 24, a.y - b.y + 1);
      const quad = (c1, w1, c2, w2, style) => {
        ctx.fillStyle = style;
        ctx.beginPath();
        ctx.moveTo(c1 - w1, a.y); ctx.lineTo(c1 + w1, a.y);
        ctx.lineTo(c2 + w2, b.y); ctx.lineTo(c2 - w2, b.y);
        ctx.closePath(); ctx.fill();
      };
      quad(a.center, a.halfW * 1.14, b.center, b.halfW * 1.14, alt ? "#e2e8f0" : "#dc2626");
      quad(a.center, a.halfW, b.center, b.halfW, alt ? "#2b3350" : "#262e47");
      if (Math.floor(a.seg / 3) % 2 === 0) {
        for (const lane of [-0.34, 0.34]) {
          quad(a.center + lane * a.halfW, Math.max(0.6, a.halfW * 0.016),
               b.center + lane * b.halfW, Math.max(0.6, b.halfW * 0.016), "#f8fafc");
        }
      }
      if (a.seg * SEG_LEN >= GOAL_M && (a.seg * SEG_LEN - GOAL_M) < SEG_LEN * 2) {
        quad(a.center, a.halfW, b.center, b.halfW, "#f8fafc");
      }
      // 街灯
      if (a.seg % 6 === 0) {
        for (const side of [-1, 1]) {
          const lx = a.center + side * a.halfW * 1.28, lh = a.halfW * 0.85;
          ctx.strokeStyle = "#475569"; ctx.lineWidth = Math.max(1, a.halfW * 0.03);
          ctx.beginPath(); ctx.moveTo(lx, a.y); ctx.lineTo(lx, a.y - lh); ctx.stroke();
          ctx.fillStyle = "#fde68a";
          ctx.beginPath(); ctx.arc(lx, a.y - lh, Math.max(1.2, a.halfW * 0.05), 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // 交通車（遠い順）
    const sorted = cars.slice().sort((a, b) => b.z - a.z);
    for (const c of sorted) {
      const rel = c.z - dist;
      if (rel < -10 || rel > DRAW_SEGS * SEG_LEN) continue;
      const idx = clamp(Math.floor(rel / SEG_LEN), 0, pts.length - 1);
      const p = pts[idx];
      const cx = p.center + c.lane * p.halfW;
      const w = clamp(p.halfW * 0.62, 4, 130);
      drawCar(ctx, cx, p.y, w, c.color, false);
    }
    // 自車
    const offRoad = Math.abs(playerX) > 1;
    const bob = offRoad && speed > 5 ? Math.sin(elapsed * 40) * 1.6 : Math.sin(elapsed * 9) * 0.7;
    ctx.save();
    ctx.translate(W / 2 + steerVis * 10, H - 18 + bob);
    ctx.rotate(steerVis * 0.045);
    drawCar(ctx, 0, 0, 148, "#a3e635", true);
    ctx.restore();
    ctx.restore();
    // HUD
    ctx.fillStyle = "#e8f6d8"; ctx.font = "bold 15px system-ui, sans-serif"; ctx.textAlign = "left";
    ctx.fillText("MIDNIGHT RUN", 16, 28);
    ctx.textAlign = "right";
    ctx.font = "bold 30px system-ui, sans-serif";
    ctx.fillStyle = "#bef264";
    ctx.fillText(`${Math.round(speed * 3.6)}`, W - 62, 62);
    ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = "#9fb4e8";
    ctx.fillText("km/h", W - 16, 62);
    const remain = Math.max(0, TIME_LIMIT - elapsed);
    ctx.fillStyle = remain < 12 ? "#fca5a5" : "#e8f6d8";
    ctx.font = "bold 15px system-ui, sans-serif"; ctx.textAlign = "left";
    ctx.fillText(`残り ${remain.toFixed(0)} 秒`, 16, 56);
    ctx.fillStyle = "#9fb4e8"; ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`${Math.min(GOAL_M, Math.floor(dist))} / ${GOAL_M} m${Math.abs(playerX) > 1 ? "  路肩走行中!" : ""}`, 16, 76);
    // 進捗バー
    ctx.fillStyle = "#1e293b"; ctx.fillRect(16, 84, W - 32, 8);
    ctx.fillStyle = "#22d3ee"; ctx.fillRect(16, 84, (W - 32) * clamp(dist / GOAL_M, 0, 1), 8);
    if (crashCool > 0.55) {
      ctx.fillStyle = "#fca5a5"; ctx.font = "bold 22px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("接触! 減速", W / 2, 150);
      ctx.textAlign = "left";
    }
  }

  return {
    logicalSize: { w: W, h: H },
    reset, update, draw, handlePressed, touchAction, handlePointer, clearInput,
    getSnapshot() {
      return {
        score, over, finished,
        distance: Math.floor(dist), goal: GOAL_M,
        speed: Math.round(speed * 3.6),
        elapsed: Math.round(elapsed * 10) / 10,
        remain: Math.round(Math.max(0, TIME_LIMIT - elapsed) * 10) / 10,
        playerX: Math.round(playerX * 100) / 100,
        cars: cars.length,
      };
    },
    hud() {
      return [
        { label: "スコア", value: String(score) },
        { label: "速度", value: `${Math.round(speed * 3.6)} km/h` },
        { label: "距離", value: `${Math.min(GOAL_M, Math.floor(dist))}m` },
        { label: "残り時間", value: `${Math.max(0, Math.ceil(TIME_LIMIT - elapsed))}秒` },
      ];
    },
  };
}
