// STAR DRIFT: 縦シューティング（ウェーブ + ボス）
import { clamp, rectsOverlap } from "../core/input.js";

const W = 480, H = 640;
const PLAYER_W = 36, PLAYER_H = 40;
const BOSS_WAVE = 6;

export function clampPlayer(x, y) {
  return {
    x: clamp(x, PLAYER_W / 2 + 4, W - PLAYER_W / 2 - 4),
    y: clamp(y, 80, H - PLAYER_H / 2 - 10),
  };
}
export { rectsOverlap };

// 同じフレームの複数弾でも、撃破済みの対象には加点しない。
export function applyEnemyDamage(enemy, damage = 1) {
  if (enemy.hp <= 0) return { hit: false, killed: false };
  enemy.hp = Math.max(0, enemy.hp - damage);
  return { hit: true, killed: enemy.hp === 0 };
}

function hitbox(cx, cy, w, h) {
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function createStarDrift(hooks) {
  let player, bullets, enemyBullets, enemies, particles, stars;
  let score, hp, wave, fireAcc, spawnQueue, spawnTimer, invuln, shake, over, elapsed, boss;
  let pointer = null;
  const touch = { left: false, right: false, up: false, down: false };

  function makeStars() {
    return Array.from({ length: 90 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      s: 0.6 + Math.random() * 1.8, v: 30 + Math.random() * 90,
    }));
  }
  function reset() {
    player = { x: W / 2, y: H - 90 };
    bullets = []; enemyBullets = []; enemies = []; particles = [];
    stars = makeStars();
    score = 0; hp = 3; wave = 0; fireAcc = 0; invuln = 0; shake = 0;
    over = false; elapsed = 0; boss = null; pointer = null;
    spawnQueue = []; spawnTimer = 0;
    touch.left = touch.right = touch.up = touch.down = false;
    nextWave();
    hooks.onScore(score);
  }

  function queueEnemy(delay, make) { spawnQueue.push({ delay, make }); }

  function nextWave() {
    wave += 1;
    hooks.onHudChange?.();
    if (wave >= BOSS_WAVE) {
      boss = { x: W / 2, y: 110, hp: 420, maxHp: 420, t: 0, fire: 0, w: 150, h: 84 };
      enemies.push(boss);
      return;
    }
    const kind = (wave - 1) % 3;
    const count = 5 + wave;
    if (kind === 0) { // 一列編隊
      for (let i = 0; i < count; i++) queueEnemy(i * 0.45, () => ({
        x: 60 + (i % 6) * 68, y: -30, vx: 0, vy: 78 + wave * 6, hp: 2, kind: "dart", fire: 1.4 + Math.random(),
      }));
    } else if (kind === 1) { // V字編隊
      for (let i = 0; i < count; i++) queueEnemy(i * 0.35, () => {
        const side = i % 2 === 0 ? -1 : 1;
        const rank = Math.ceil(i / 2);
        return { x: W / 2 + side * rank * 42, y: -30 - rank * 22, vx: side * -14, vy: 92 + wave * 6, hp: 2, kind: "dart", fire: 1.6 + Math.random() };
      });
    } else { // 蛇行する射手
      for (let i = 0; i < count; i++) queueEnemy(i * 0.7, () => ({
        x: 50 + Math.random() * (W - 100), y: -30, vx: 0, vy: 58 + wave * 5,
        hp: 4, kind: "weaver", phase: Math.random() * 6, fire: 1 + Math.random(),
      }));
    }
  }

  function burst(x, y, color, n = 10) {
    for (let i = 0; i < n && particles.length < 220; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 150;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, color });
    }
  }
  function hurtPlayer() {
    if (invuln > 0 || over) return;
    hp -= 1; invuln = 2; shake = 0.35;
    hooks.onHudChange?.();
    burst(player.x, player.y, "#f87171", 16);
    hooks.play("hurt");
    if (hp <= 0) {
      over = true; hooks.play("lose");
      hooks.onGameOver({ score, win: false, detail: `WAVE ${wave} 到達` });
    }
  }

  function update(dt, kb) {
    if (over) return;
    elapsed += dt;
    if (invuln > 0) invuln -= dt;
    if (shake > 0) shake -= dt;
    for (const s of stars) { s.y += s.v * dt; if (s.y > H + 2) { s.y = -2; s.x = Math.random() * W; } }
    // プレイヤー移動
    const sp = 285;
    let dx = 0, dy = 0;
    if (kb.isDown("ArrowLeft") || kb.isDown("KeyA") || touch.left) dx -= 1;
    if (kb.isDown("ArrowRight") || kb.isDown("KeyD") || touch.right) dx += 1;
    if (kb.isDown("ArrowUp") || kb.isDown("KeyW") || touch.up) dy -= 1;
    if (kb.isDown("ArrowDown") || kb.isDown("KeyS") || touch.down) dy += 1;
    if (dx !== 0 || dy !== 0) pointer = null;
    const len = Math.hypot(dx, dy) || 1;
    player.x += (dx / len) * sp * dt;
    player.y += (dy / len) * sp * dt;
    if (pointer) {
      player.x += (pointer.x - player.x) * Math.min(1, dt * 14);
      player.y += (pointer.y - 34 - player.y) * Math.min(1, dt * 14);
    }
    const cl = clampPlayer(player.x, player.y);
    player.x = cl.x; player.y = cl.y;
    // 自動発射
    fireAcc += dt;
    while (fireAcc >= 0.17) {
      fireAcc -= 0.17;
      bullets.push({ x: player.x - 9, y: player.y - 18, vy: -520 });
      bullets.push({ x: player.x + 9, y: player.y - 18, vy: -520 });
      hooks.play("shoot");
    }
    // スポーン
    spawnTimer += dt;
    for (const q of spawnQueue) q.delay -= dt;
    while (spawnQueue.length && spawnQueue[0].delay <= 0) {
      enemies.push(spawnQueue.shift().make());
    }
    // 弾
    for (const b of bullets) b.y += b.vy * dt;
    bullets = bullets.filter((b) => b.y > -16);
    for (const b of enemyBullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    enemyBullets = enemyBullets.filter((b) => b.y < H + 14 && b.y > -14 && b.x > -14 && b.x < W + 14);
    // 敵
    for (const e of enemies) {
      if (e === boss) {
        e.t += dt;
        e.x = W / 2 + Math.sin(e.t * 0.7) * 110;
        e.y = 104 + Math.sin(e.t * 1.3) * 14;
        e.fire -= dt;
        if (e.fire <= 0) {
          e.fire = Math.max(0.45, 0.9 - (1 - e.hp / e.maxHp) * 0.4);
          for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) {
            enemyBullets.push({ x: e.x, y: e.y + 36, vx: Math.sin(a) * 220, vy: Math.cos(a) * 220 });
          }
          const ang = Math.atan2(player.y - e.y, player.x - e.x);
          enemyBullets.push({ x: e.x - 44, y: e.y + 20, vx: Math.cos(ang) * 250, vy: Math.sin(ang) * 250 });
          enemyBullets.push({ x: e.x + 44, y: e.y + 20, vx: Math.cos(ang) * 250, vy: Math.sin(ang) * 250 });
          hooks.play("shoot");
        }
        continue;
      }
      e.y += e.vy * dt;
      e.x += (e.vx || 0) * dt;
      if (e.kind === "weaver") { e.phase += dt * 2.4; e.x += Math.sin(e.phase) * 110 * dt; }
      e.x = clamp(e.x, 18, W - 18);
      e.fire -= dt;
      if (e.fire <= 0 && e.y > 0 && e.y < H - 180) {
        e.fire = 1.6 + Math.random() * 1.2 - Math.min(0.5, wave * 0.06);
        const ang = Math.atan2(player.y - e.y, player.x - e.x);
        const spd = 180 + wave * 12;
        enemyBullets.push({ x: e.x, y: e.y + 16, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd });
      }
    }
    enemies = enemies.filter((e) => e === boss || (e.y < H + 40 && e.hp > 0));
    // 自弾 vs 敵
    const pHit = hitbox(player.x, player.y, 22, 26);
    for (const b of bullets) {
      if (over) break;
      if (b.dead) continue;
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        const ew = e === boss ? boss.w : 32, eh = e === boss ? boss.h : 30;
        if (rectsOverlap(hitbox(b.x, b.y, 5, 12), hitbox(e.x, e.y, ew, eh))) {
          b.dead = true;
          const damage = applyEnemyDamage(e);
          burst(b.x, b.y, "#fde68a", 3);
          if (damage.killed) {
            if (e === boss) {
              score += 3000 + hp * 500; hooks.onScore(score);
              burst(e.x, e.y, "#fb923c", 40);
              over = true; hooks.play("win");
              hooks.onGameOver({ score, win: true, detail: `ボス撃破 / 残りHP ${hp}` });
            } else {
              score += e.kind === "weaver" ? 200 : 100;
              hooks.onScore(score);
              burst(e.x, e.y, "#67e8f9", 12);
              hooks.play("explode");
            }
          } else hooks.play("hit");
          break;
        }
      }
    }
    bullets = bullets.filter((b) => !b.dead);
    if (over) return;
    // 敵弾・敵機 vs プレイヤー
    for (const b of enemyBullets) {
      if (!b.dead && rectsOverlap(hitbox(b.x, b.y, 8, 8), pHit)) { b.dead = true; hurtPlayer(); }
    }
    enemyBullets = enemyBullets.filter((b) => !b.dead);
    for (const e of enemies) {
      const ew = e === boss ? boss.w * 0.8 : 28, eh = e === boss ? boss.h * 0.8 : 26;
      if (rectsOverlap(hitbox(e.x, e.y, ew, eh), pHit)) {
        if (e !== boss) { e.hp = 0; burst(e.x, e.y, "#67e8f9", 10); }
        hurtPlayer();
      }
    }
    enemies = enemies.filter((e) => e === boss || e.hp > 0);
    // パーティクル
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    // ウェーブ完了
    if (!boss && enemies.length === 0 && spawnQueue.length === 0) nextWave();
  }

  function handlePressed() {}
  function touchAction(action, down) {
    if (action in touch) touch[action] = down;
  }
  function handlePointer(x, y, type) {
    if (type === "up") pointer = null;
    else pointer = { x, y };
  }

  function clearInput() {
    touch.left = touch.right = touch.up = touch.down = false;
    pointer = null;
  }

  function drawShip(ctx, x, y) {
    const blink = invuln > 0 && Math.floor(elapsed * 12) % 2 === 0;
    ctx.globalAlpha = blink ? 0.35 : 1;
    const flame = 10 + Math.sin(elapsed * 30) * 4;
    ctx.fillStyle = "#fb923c";
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 16); ctx.lineTo(x, y + 16 + flame); ctx.lineTo(x + 5, y + 16);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#a3e635";
    ctx.beginPath();
    ctx.moveTo(x, y - 20); ctx.lineTo(x + 8, y + 4); ctx.lineTo(x + 20, y + 16);
    ctx.lineTo(x + 10, y + 16); ctx.lineTo(x + 6, y + 10); ctx.lineTo(x - 6, y + 10);
    ctx.lineTo(x - 10, y + 16); ctx.lineTo(x - 20, y + 16); ctx.lineTo(x - 8, y + 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#1a2e05"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#0e7490";
    ctx.beginPath(); ctx.ellipse(x, y - 4, 4.5, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function drawEnemy(ctx, e) {
    if (e === boss) {
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(e.x - 75, e.y - 30, 150, 60);
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.moveTo(e.x - 75, e.y + 10); ctx.lineTo(e.x - 105, e.y + 42); ctx.lineTo(e.x - 40, e.y + 30);
      ctx.lineTo(e.x + 40, e.y + 30); ctx.lineTo(e.x + 105, e.y + 42); ctx.lineTo(e.x + 75, e.y + 10);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath(); ctx.arc(e.x, e.y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#450a0a";
      ctx.beginPath(); ctx.arc(e.x, e.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fca5a5";
      ctx.fillRect(e.x - 58, e.y + 12, 14, 18); ctx.fillRect(e.x + 44, e.y + 12, 14, 18);
      // ボスHPバー
      ctx.fillStyle = "#1e293b"; ctx.fillRect(60, 56, W - 120, 10);
      ctx.fillStyle = "#ef4444"; ctx.fillRect(60, 56, (W - 120) * Math.max(0, e.hp / e.maxHp), 10);
      ctx.strokeStyle = "#fca5a5"; ctx.strokeRect(60.5, 56.5, W - 120, 10);
      return;
    }
    if (e.kind === "weaver") {
      ctx.fillStyle = "#e879f9";
      ctx.beginPath();
      ctx.moveTo(e.x, e.y + 16); ctx.lineTo(e.x + 16, e.y - 4); ctx.lineTo(e.x + 20, e.y - 16);
      ctx.lineTo(e.x, e.y - 8); ctx.lineTo(e.x - 20, e.y - 16); ctx.lineTo(e.x - 16, e.y - 4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#4a044e"; ctx.stroke();
      ctx.fillStyle = "#fdf4ff";
      ctx.beginPath(); ctx.arc(e.x, e.y, 4, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.moveTo(e.x, e.y + 16); ctx.lineTo(e.x + 15, e.y - 12); ctx.lineTo(e.x + 5, e.y - 6);
      ctx.lineTo(e.x - 5, e.y - 6); ctx.lineTo(e.x - 15, e.y - 12);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#082f49"; ctx.stroke();
      ctx.fillStyle = "#e0f2fe";
      ctx.beginPath(); ctx.arc(e.x, e.y + 2, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function draw(ctx) {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    ctx.fillStyle = "#050816"; ctx.fillRect(-10, -10, W + 20, H + 20);
    for (const s of stars) {
      ctx.fillStyle = s.s > 1.8 ? "#e0f2fe" : "#64748b";
      ctx.fillRect(s.x, s.y, s.s, s.s * 2.2);
    }
    ctx.fillStyle = "#bef264";
    for (const b of bullets) ctx.fillRect(b.x - 2, b.y - 7, 4, 12);
    ctx.fillStyle = "#fda4af";
    for (const b of enemyBullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); }
    for (const e of enemies) drawEnemy(ctx, e);
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    drawShip(ctx, player.x, player.y);
    ctx.restore();
    ctx.fillStyle = "#e8f6d8"; ctx.font = "bold 15px system-ui, sans-serif"; ctx.textAlign = "left";
    ctx.fillText("STAR DRIFT", 16, 28);
    ctx.fillStyle = "#9fb4e8"; ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(boss ? "WARNING: 大型艦接近" : `WAVE ${wave}`, 16, 48);
    ctx.textAlign = "right";
    ctx.fillText(`HP ${"♥".repeat(Math.max(0, hp))}`, W - 16, 28);
    ctx.fillText(invuln > 0 ? "無敵中" : "", W - 16, 48);
    ctx.textAlign = "left";
  }

  return {
    logicalSize: { w: W, h: H },
    reset, update, draw, handlePressed, touchAction, handlePointer, clearInput,
    getSnapshot() {
      return {
        score, hp, wave, over, isBoss: Boolean(boss),
        bossHp: boss ? Math.max(0, boss.hp) : null,
        player: { x: Math.round(player.x), y: Math.round(player.y) },
        enemies: enemies.length, bullets: bullets.length, enemyBullets: enemyBullets.length,
        invuln: Math.round(invuln * 10) / 10,
      };
    },
    hud() {
      return [
        { label: "スコア", value: String(score) },
        { label: "WAVE", value: boss ? "ボス" : String(wave) },
        { label: "HP", value: String(hp) },
      ];
    },
  };
}
