import test from "node:test";
import assert from "node:assert/strict";

import {
  COLS, ROWS, SHAPES, createEmptyBoard, canPlace, clearFullLines,
  rotateMatrix, createBag, gravityInterval, createBlockStack,
} from "../dist/games/block-stack.js";
import { paddleBounce, circleHitsRect, buildStage, createPrismBreak } from "../dist/games/prism-break.js";
import { clampPlayer, rectsOverlap, createStarDrift, applyEnemyDamage } from "../dist/games/star-drift.js";
import { curveAt, isColliding, project, createMidnightRun, GOAL_M } from "../dist/games/midnight-run.js";
import { clamp } from "../dist/core/input.js";

function stubHooks() {
  return { score: 0, over: null, onScore(s) { this.score = s; }, onGameOver(i) { this.over = i; }, play() {} };
}
const noKeys = { isDown: () => false };

test("同時に弾が重なっても同じ敵の撃破は1回だけ成立する", () => {
  const enemy = { hp: 1 };
  const results = Array.from({ length: 4 }, () => applyEnemyDamage(enemy));
  assert.equal(results.filter(r => r.killed).length, 1);
  assert.equal(results.filter(r => r.hit).length, 1);
  assert.equal(enemy.hp, 0);
});

test("PRISM BREAK: マウス操作後もキーボードで両端まで動ける", () => {
  const game = createPrismBreak(stubHooks());
  game.reset();
  game.handlePointer(430, 580, "move");
  for (let i = 0; i < 30; i++) game.update(1 / 60, noKeys);
  for (let i = 0; i < 120; i++) game.update(1 / 60, keysDown("ArrowLeft"));
  assert.ok(game.getSnapshot().paddleX <= 51);
  for (let i = 0; i < 120; i++) game.update(1 / 60, keysDown("ArrowRight"));
  assert.ok(game.getSnapshot().paddleX >= 429);
  game.handlePointer(240, 580, "move");
  for (let i = 0; i < 45; i++) game.update(1 / 60, noKeys);
  game.handlePointer(0, 0, "up");
  const x = game.getSnapshot().paddleX;
  for (let i = 0; i < 45; i++) game.update(1 / 60, noKeys);
  assert.equal(game.getSnapshot().paddleX, x);
});

test("一時停止時の入力解除はシューティングの位置と進行をリセットしない", () => {
  const game = createStarDrift(stubHooks());
  game.reset();
  game.touchAction("left", true);
  game.update(0.25, noKeys);
  const before = game.getSnapshot();
  assert.ok(before.player.x < 240);
  game.clearInput();
  game.update(0.25, noKeys);
  const after = game.getSnapshot();
  assert.deepEqual(after.player, before.player);
  assert.equal(after.hp, before.hp);
  assert.ok(after.bullets > 0);
});

test("MIDNIGHT RUN: 衝突の減点は次フレームにも残る", () => {
  const previousRandom = Math.random;
  Math.random = () => 0;
  try {
    const game = createMidnightRun(stubHooks());
    game.reset();
    let collided = false;
    for (let i = 0; i < 120 * 35; i++) {
      const before = game.getSnapshot();
      const steering = { isDown: code => code === "ArrowUp" || (code === "ArrowLeft" && before.playerX > -0.62) || (code === "ArrowRight" && before.playerX < -0.62) };
      game.update(1 / 120, steering);
      if (game.getSnapshot().score < before.score - 80) {
        game.update(1 / 120, noKeys);
        const after = game.getSnapshot();
        assert.ok(after.score < after.distance - 50);
        collided = true;
        break;
      }
    }
    assert.ok(collided, "実際に衝突する配置で検査する");
  } finally { Math.random = previousRandom; }
});
function keysDown(...codes) {
  const s = new Set(codes);
  return { isDown: (c) => s.has(c) };
}

// --- BLOCK STACK の純粋ロジック ---
test("空盤面では中央スポーン位置に置けるが壁の外には置けない", () => {
  const board = createEmptyBoard();
  assert.equal(canPlace(board, SHAPES.T, 4, 0), true);
  assert.equal(canPlace(board, SHAPES.T, -1, 0), false);
  assert.equal(canPlace(board, SHAPES.T, COLS - 1, 0), false);
  assert.equal(canPlace(board, SHAPES.I, 3, ROWS - 1), false);
});

test("既存ブロックと重なる位置には置けない", () => {
  const board = createEmptyBoard();
  board[19][5] = "T";
  assert.equal(canPlace(board, SHAPES.O, 5, 18), false);
  assert.equal(canPlace(board, SHAPES.O, 6, 18), true);
});

test("そろったラインだけが消え、上段が詰まる", () => {
  const board = createEmptyBoard();
  board[19] = Array(COLS).fill("I");
  board[18][0] = "J";
  const { board: next, cleared } = clearFullLines(board);
  assert.equal(cleared, 1);
  assert.equal(next[19][0], "J");
  assert.equal(next[18][0], null);
  assert.equal(next.length, ROWS);
});

test("回転は4回で元に戻り、ブロック数が保存される", () => {
  for (const type of Object.keys(SHAPES)) {
    let m = SHAPES[type];
    const count = m.flat().reduce((a, b) => a + b, 0);
    for (let i = 0; i < 4; i++) m = rotateMatrix(m, 1);
    assert.deepEqual(m, SHAPES[type], type);
    assert.equal(m.flat().reduce((a, b) => a + b, 0), count);
    assert.equal(count, 4, `${type} は4セル`);
  }
});

test("7種1巡バッグは7種を1つずつ含む", () => {
  const bag = createBag(() => 0.42);
  assert.equal(bag.length, 7);
  assert.deepEqual(new Set(bag), new Set(Object.keys(SHAPES)));
});

test("落下間隔はレベルとともに短くなり下限を持つ", () => {
  assert.ok(gravityInterval(1) > gravityInterval(5));
  assert.ok(gravityInterval(99) >= 0.07);
});

test("BLOCK STACK: ハードドロップでピースが固定され盤面に残る", () => {
  const hooks = stubHooks();
  const game = createBlockStack(hooks);
  game.reset();
  game.handlePressed("Space");
  const snap = game.getSnapshot();
  assert.equal(snap.filledCells, 4);
  assert.ok(snap.score >= 0);
});

test("BLOCK STACK: ホールドは1ピースにつき1回まで", () => {
  const hooks = stubHooks();
  const game = createBlockStack(hooks);
  game.reset();
  game.handlePressed("KeyC");
  const first = game.getSnapshot();
  assert.equal(first.canHold, false);
  assert.ok(first.hold);
  game.handlePressed("KeyC");
  assert.equal(game.getSnapshot().hold, first.hold);
  // 固定すると再びホールド可能になる
  game.handlePressed("Space");
  assert.equal(game.getSnapshot().canHold, true);
});

// --- PRISM BREAK ---
test("パドル反射は中心で真上、端で斜めになり速さが保存される", () => {
  const center = paddleBounce(0, 300);
  assert.equal(Math.round(center.vx), 0);
  assert.ok(center.vy < 0);
  const edge = paddleBounce(1, 300);
  assert.ok(edge.vx > 0 && edge.vy < 0);
  assert.ok(Math.abs(Math.hypot(edge.vx, edge.vy) - 300) < 0.001);
  const overEdge = paddleBounce(5, 300); // クランプされる
  assert.ok(Math.abs(Math.hypot(overEdge.vx, overEdge.vy) - 300) < 0.001);
});

test("円と矩形の当たり判定", () => {
  const rect = { x: 100, y: 100, w: 40, h: 20 };
  assert.equal(circleHitsRect(120, 95, 7, rect), true);
  assert.equal(circleHitsRect(120, 80, 7, rect), false);
});

test("各ステージにブロックがあり、後半ほど堅いブロックを含む", () => {
  const s1 = buildStage(1), s2 = buildStage(2), s3 = buildStage(3);
  assert.ok(s1.length > 0 && s2.length > 0 && s3.length > 0);
  assert.ok(s1.every((b) => b.maxHp === 1));
  assert.ok(s2.some((b) => b.maxHp === 2));
  assert.ok(s3.some((b) => b.maxHp === 2));
  for (const b of [...s1, ...s2, ...s3]) {
    assert.ok(b.x >= 0 && b.x + b.w <= 480, "ブロックは画面内");
  }
});

test("PRISM BREAK: 発射後にボールが動き、パドルは画面内に収まる", () => {
  const hooks = stubHooks();
  const game = createPrismBreak(hooks);
  game.reset();
  const before = game.getSnapshot();
  game.handlePressed("Space");
  for (let i = 0; i < 30; i++) game.update(1 / 60, keysDown("ArrowLeft"));
  const after = game.getSnapshot();
  assert.notDeepEqual(after.ball, before.ball);
  assert.ok(after.paddleX >= 50 && after.paddleX <= 430);
});

// --- STAR DRIFT ---
test("プレイヤーは画面境界でクランプされる", () => {
  const p = clampPlayer(-999, 9999);
  assert.ok(p.x >= 18 && p.y <= 640);
  const q = clampPlayer(999, -50);
  assert.ok(q.x <= 480 - 18 && q.y >= 80);
});

test("矩形同士の重なり判定", () => {
  assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }), false);
});

test("STAR DRIFT: 時間経過で弾が発射され、敵が出現し、上限なく増えない", () => {
  const hooks = stubHooks();
  const game = createStarDrift(hooks);
  game.reset();
  let sawBullet = false, sawEnemy = false;
  for (let i = 0; i < 60 * 8; i++) {
    game.update(1 / 60, noKeys);
    const s = game.getSnapshot();
    if (s.bullets > 0) sawBullet = true;
    if (s.enemies > 0) sawEnemy = true;
    assert.ok(s.bullets < 200 && s.enemyBullets < 400, "弾配列が有界");
  }
  assert.ok(sawBullet && sawEnemy);
});

// --- MIDNIGHT RUN ---
test("カーブは滑らかで有界、遠近投影は遠いほど地平線に近づく", () => {
  for (let z = 0; z < GOAL_M; z += 137) assert.ok(Math.abs(curveAt(z)) < 3);
  assert.ok(project(10).y > project(200).y);
  assert.ok(project(10).halfW > project(200).halfW);
});

test("同一深度・同一レーンでのみ衝突する", () => {
  assert.equal(isColliding(100, 0, { z: 105, lane: 0.1 }), true);
  assert.equal(isColliding(100, 0, { z: 160, lane: 0 }), false);
  assert.equal(isColliding(100, -0.6, { z: 102, lane: 0.6 }), false);
});

test("MIDNIGHT RUN: ステアリングで車線を保ちながら加速すると大きく前進する", () => {
  const hooks = stubHooks();
  const game = createMidnightRun(hooks);
  game.reset();
  // 中央へ戻るように自動で切る簡易ドライバー（カーブの遠心力に抗う操作の再現）
  let maxSpeed = 0;
  for (let i = 0; i < 60 * 25; i++) {
    const snap = game.getSnapshot();
    maxSpeed = Math.max(maxSpeed, snap.speed);
    const steer = snap.playerX > 0.06 ? "ArrowLeft" : snap.playerX < -0.06 ? "ArrowRight" : null;
    game.update(1 / 60, keysDown("ArrowUp", ...(steer ? [steer] : [])));
  }
  const s = game.getSnapshot();
  assert.ok(s.distance > 800, `distance=${s.distance}`);
  assert.ok(maxSpeed > 150, `maxSpeed=${maxSpeed}`);
  assert.ok(Math.abs(s.playerX) <= 1.2, `playerX=${s.playerX}`);
});

test("MIDNIGHT RUN: 無操作では巡航するがカーブで路外へ流れうる（操作が意味を持つ）", () => {
  const hooks = stubHooks();
  const game = createMidnightRun(hooks);
  game.reset();
  let wentOffRoad = false;
  for (let i = 0; i < 60 * 30; i++) {
    game.update(1 / 60, noKeys);
    if (Math.abs(game.getSnapshot().playerX) > 1) wentOffRoad = true;
  }
  const s = game.getSnapshot();
  assert.ok(s.distance > 200, `distance=${s.distance}`);
  assert.ok(wentOffRoad, "ステアリングなしでは路外へ流れるはず");
});

test("clamp は境界で止まる", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});
