// MUSE ARCADE メイン: ライブラリ表示とゲームのライフサイクル管理
import { createAudio } from "./core/audio.js";
import { createKeyboard, clamp } from "./core/input.js";
import { fitCanvas, fitGameLayout } from "./core/runtime.js";
import { loadBestScores, saveBestScores, loadSoundEnabled, saveSoundEnabled } from "./core/storage.js";
import { createBlockStack } from "./games/block-stack.js";
import { createPrismBreak } from "./games/prism-break.js";
import { createStarDrift } from "./games/star-drift.js";
import { createMidnightRun } from "./games/midnight-run.js";

const GAMES = [
  {
    id: "block-stack",
    title: "BLOCK STACK",
    sub: "落ちものパズル",
    color: "#22d3ee",
    desc: "落ちてくるブロックを積み重ね、横一列をそろえて消そう。ホールドとゴースト表示でじっくり狙える定番パズル。",
    howto: "←→: 移動 / ↓: ソフトドロップ / ↑ または X: 回転 / Z: 逆回転\nSpace: ハードドロップ / C: ホールド（1ピースに1回）\nラインを消すとレベルが上がって落下が速くなります。天井まで積み上がるとゲームオーバーです。",
    create: createBlockStack,
    touch: [
      { action: "left", label: "←" }, { action: "right", label: "→" },
      { action: "down", label: "↓" }, { action: "rotateCCW", label: "↺" },
      { action: "rotate", label: "回転" }, { action: "drop", label: "落下" },
      { action: "hold", label: "ホールド" },
    ],
  },
  {
    id: "prism-break",
    title: "PRISM BREAK",
    sub: "ブロック崩し",
    color: "#bef264",
    desc: "パドルでボールを跳ね返して全ブロックを崩そう。当てる位置で角度が変わる、全3ステージのブロック崩し。",
    howto: "←→ または マウス/指の移動: パドル移動\nSpace または タップ/発射ボタン: ボール発射\nライフは3つ。数字付きブロックは2回当てると壊れます。全3ステージ制覇でクリアです。",
    create: createPrismBreak,
    touch: [
      { action: "left", label: "←" }, { action: "launch", label: "発射" },
      { action: "right", label: "→" },
    ],
  },
  {
    id: "star-drift",
    title: "STAR DRIFT",
    sub: "縦シューティング",
    color: "#f472b6",
    desc: "星空を駆ける縦スクロールシューティング。編隊をかわして撃ち抜き、最後に待ち受ける大型艦を倒そう。",
    howto: "方向キー または WASD: 移動（ショットは自動発射）\n画面ドラッグでも移動できます。HPは3、被弾直後は少し無敵になります。\nWAVE 6 のボスを倒すとクリアです。",
    create: createStarDrift,
    touch: [
      { action: "left", label: "←" }, { action: "up", label: "↑" },
      { action: "down", label: "↓" }, { action: "right", label: "→" },
    ],
  },
  {
    id: "midnight-run",
    title: "MIDNIGHT RUN",
    sub: "レース",
    color: "#fbbf24",
    desc: "真夜中のハイウェイを疾走する疑似3Dレース。交通車両をかわしながら、80秒以内に3000m先のゴールを目指そう。",
    howto: "←→: ステアリング / ↑: アクセル / ↓: ブレーキ\n操作しなくても巡航速度までは自動で加速します。カーブでは外側に流れるので早めのステアリングを。\n接触すると大きく減速します。路肩走行も減速します。",
    create: createMidnightRun,
    touch: [
      { action: "left", label: "←" }, { action: "down", label: "ブレーキ" },
      { action: "up", label: "アクセル" }, { action: "right", label: "→" },
    ],
  },
];

const $ = (sel) => document.querySelector(sel);
const libraryView = $("#libraryView");
const gameView = $("#gameView");
const gameGrid = $("#gameGrid");
const canvas = $("#gameCanvas");
const overlay = $("#overlay");
const overlayTitle = $("#overlayTitle");
const overlayText = $("#overlayText");
const overlayScore = $("#overlayScore");
const primaryBtn = $("#primaryBtn");
const pauseBtn = $("#pauseBtn");
const hudBar = $("#hudBar");
const touchControls = $("#touchControls");
const srStatus = $("#srStatus");

const audio = createAudio();
const keyboard = createKeyboard();
keyboard.attach();
let best = loadBestScores();
audio.setEnabled(loadSoundEnabled());

let view = "library";       // library | game
let state = "library";      // library | ready | playing | paused | result
let currentMeta = null;
let currentGame = null;
let currentScore = 0;
let ctx = null;
let rafId = null;
let lastTs = 0;
let resultInfo = null;
let lastPlayedId = null;
let canvasPointerId = null;

function announce(msg) { srStatus.textContent = msg; }

function layoutGame() {
  if (view === "game" && currentGame) {
    fitGameLayout(canvas, touchControls, currentGame.logicalSize.w, currentGame.logicalSize.h);
  }
}

function clearGameInput() {
  keyboard.clear();
  currentGame?.clearInput();
  if (canvasPointerId !== null && canvas.hasPointerCapture(canvasPointerId)) {
    canvas.releasePointerCapture(canvasPointerId);
  }
  canvasPointerId = null;
  for (const button of touchControls.children) button.classList.remove("is-down");
}

function enableTouchControls(enabled) {
  for (const button of touchControls.children) button.disabled = !enabled;
}

// ---------- カードプレビュー（オリジナル描画） ----------
function drawPreview(cv, id) {
  const g = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  g.fillStyle = "#0b1020"; g.fillRect(0, 0, W, H);
  if (id === "block-stack") {
    const cell = 13, ox = 88, oy = 18;
    g.strokeStyle = "#3b4a7a"; g.strokeRect(ox, oy, cell * 10, cell * 11);
    const rows = [
      ["J","J",null,null,"T",null,null,null,null,null],
      ["J","S","S",null,"T","T",null,"O","O",null],
      ["L","S","Z","Z","I","I","I","I","O","O"],
      ["L","L","Z","T","T","J","S","S","Z","Z"],
    ];
    const colors = { I:"#22d3ee", O:"#facc15", T:"#c084fc", S:"#4ade80", Z:"#f87171", J:"#60a5fa", L:"#fb923c" };
    rows.forEach((row, r) => row.forEach((t, c) => {
      if (!t) return;
      g.fillStyle = colors[t];
      g.fillRect(ox + c * cell + 1, oy + (7 + r) * cell + 1, cell - 2, cell - 2);
    }));
    g.globalAlpha = 0.3; g.fillStyle = "#c084fc";
    g.fillRect(ox + 4 * cell, oy + 2 * cell, cell * 3, cell);
    g.globalAlpha = 1;
  } else if (id === "prism-break") {
    const cols = ["#f87171","#fb923c","#facc15","#4ade80","#22d3ee","#c084fc"];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
      if (r === 3 && (c === 2 || c === 5)) continue;
      g.fillStyle = cols[r % cols.length];
      g.fillRect(28 + c * 34, 18 + r * 16, 30, 12);
    }
    g.strokeStyle = "rgba(240,253,255,0.5)"; g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(150, 138); g.lineTo(196, 84); g.lineTo(228, 112); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#f0fdff"; g.beginPath(); g.arc(196, 84, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#bef264"; g.fillRect(112, 142, 84, 10);
  } else if (id === "star-drift") {
    g.fillStyle = "#94a3b8";
    for (let i = 0; i < 42; i++) g.fillRect((i * 71) % W, (i * 43) % H, 2, 3);
    g.fillStyle = "#38bdf8";
    for (const [ex, ey] of [[80, 44], [160, 30], [240, 44]]) {
      g.beginPath(); g.moveTo(ex, ey + 12); g.lineTo(ex + 13, ey - 10); g.lineTo(ex - 13, ey - 10); g.closePath(); g.fill();
    }
    g.fillStyle = "#fda4af";
    for (const [bx, by] of [[130, 86], [205, 100]]) { g.beginPath(); g.arc(bx, by, 3.5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#bef264"; g.fillRect(150, 96, 3, 12); g.fillRect(168, 96, 3, 12);
    g.fillStyle = "#a3e635";
    g.beginPath();
    g.moveTo(160, 116); g.lineTo(170, 140); g.lineTo(184, 150); g.lineTo(136, 150); g.lineTo(150, 140);
    g.closePath(); g.fill();
    g.fillStyle = "#fb923c";
    g.beginPath(); g.moveTo(155, 150); g.lineTo(160, 164); g.lineTo(165, 150); g.closePath(); g.fill();
  } else {
    const horizon = 74;
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#070b1f"); sky.addColorStop(1, "#3b2f5e");
    g.fillStyle = sky; g.fillRect(0, 0, W, horizon);
    g.fillStyle = "#fef9c3"; g.beginPath(); g.arc(272, 26, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#131f42"; g.fillRect(0, horizon, W, H - horizon);
    g.fillStyle = "#2b3350";
    g.beginPath(); g.moveTo(58, H); g.lineTo(146, horizon); g.lineTo(188, horizon); g.lineTo(276, H); g.closePath(); g.fill();
    g.strokeStyle = "#f8fafc"; g.setLineDash([10, 8]); g.lineWidth = 3;
    g.beginPath(); g.moveTo(167, H); g.lineTo(167, horizon); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#60a5fa"; g.fillRect(176, 96, 22, 12); g.fillRect(180, 88, 14, 9);
    g.fillStyle = "#a3e635"; g.fillRect(122, 138, 76, 26); g.fillRect(136, 120, 48, 20);
    g.fillStyle = "#0f172a"; g.fillRect(141, 124, 38, 11);
    g.fillStyle = "#fef08a"; g.fillRect(126, 150, 12, 6); g.fillRect(182, 150, 12, 6);
  }
}

function renderLibrary() {
  gameGrid.innerHTML = "";
  for (const meta of GAMES) {
    const card = document.createElement("article");
    card.className = "game-card";
    const cv = document.createElement("canvas");
    cv.width = 320; cv.height = 180;
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", `${meta.title} のプレビュー画像`);
    drawPreview(cv, meta.id);
    const body = document.createElement("div");
    body.className = "card-body";
    const bestVal = best[meta.id];
    body.innerHTML = `
      <p class="card-kicker" style="color:${meta.color}">${meta.sub}</p>
      <h3 class="card-title">${meta.title}</h3>
      <p class="card-desc">${meta.desc}</p>
      <div class="card-meta">
        <span class="best-score"><small>ベストスコア（この端末）</small>${bestVal === undefined ? "未プレイ" : bestVal.toLocaleString()}</span>
        <button class="btn btn-primary" type="button" id="play-${meta.id}">プレイ</button>
      </div>`;
    card.append(cv, body);
    gameGrid.append(card);
    body.querySelector("button").addEventListener("click", () => {
      audio.unlock(); audio.play("ui");
      enterGame(meta);
    });
  }
}

// ---------- ゲームのライフサイクル ----------
function hooksFor(meta) {
  return {
    onScore(s) { currentScore = s; refreshHud(); },
    onHudChange() { refreshHud(); },
    onGameOver(info) {
      if (state === "result") return;
      resultInfo = info;
      currentScore = info.score;
      const prevBest = best[meta.id] ?? -1;
      const isNewRecord = info.score > prevBest;
      if (isNewRecord) {
        best[meta.id] = info.score;
        saveBestScores(best);
      }
      state = "result";
      clearGameInput();
      enableTouchControls(false);
      buildHud();
      overlayTitle.textContent = info.win ? "ゲームクリア!" : "ゲームオーバー";
      overlayText.textContent = info.detail || "";
      overlayScore.hidden = false;
      overlayScore.textContent = `スコア ${info.score.toLocaleString()}${isNewRecord ? "（新記録!）" : ""} / ベスト ${best[meta.id].toLocaleString()}`;
      primaryBtn.textContent = "もう一度遊ぶ";
      overlay.hidden = false;
      pauseBtn.textContent = "一時停止";
      updateCanvasLabel();
      announce(`${info.win ? "ゲームクリア" : "ゲームオーバー"}。スコア ${info.score}。${isNewRecord ? "新記録です。" : ""}`);
      primaryBtn.focus();
    },
    play(name) { audio.play(name); },
  };
}

function buildTouchControls(meta) {
  touchControls.innerHTML = "";
  touchControls.style.setProperty("--touch-count", meta.touch.length);
  touchControls.style.setProperty("--touch-mobile-columns", Math.min(4, meta.touch.length));
  for (const t of meta.touch) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = t.label;
    btn.setAttribute("aria-label", `${t.label} ボタン`);
    const set = (down, e) => {
      if (e) e.preventDefault();
      if (down && state !== "playing") return;
      btn.classList.toggle("is-down", down);
      if (currentGame && (!down || state === "playing")) currentGame.touchAction(t.action, down);
      if (down) audio.unlock();
    };
    btn.addEventListener("pointerdown", (e) => set(true, e));
    btn.addEventListener("pointerup", (e) => set(false, e));
    btn.addEventListener("pointercancel", () => set(false));
    btn.addEventListener("pointerleave", () => set(false));
    btn.addEventListener("keydown", (e) => {
      if (e.code !== "Enter" && e.code !== "Space") return;
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) set(true);
    });
    btn.addEventListener("keyup", (e) => {
      if (e.code !== "Enter" && e.code !== "Space") return;
      e.preventDefault(); e.stopPropagation(); set(false);
    });
    btn.addEventListener("blur", () => set(false));
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    touchControls.append(btn);
  }
  enableTouchControls(state === "playing");
}

function buildHud() {
  hudBar.innerHTML = "";
  if (!currentGame) return;
  for (const item of currentGame.hud()) {
    const chip = document.createElement("span");
    chip.className = "hud-chip";
    chip.innerHTML = `<small></small><strong></strong>`;
    chip.querySelector("small").textContent = item.label;
    chip.querySelector("strong").textContent = item.value;
    hudBar.append(chip);
  }
  const bestChip = document.createElement("span");
  bestChip.className = "hud-chip";
  bestChip.innerHTML = `<small>ベスト（この端末）</small><strong>${(best[currentMeta.id] ?? 0).toLocaleString()}</strong>`;
  hudBar.append(bestChip);
}

function refreshHud() {
  if (!currentGame) return;
  const items = currentGame.hud();
  const values = hudBar.querySelectorAll("strong");
  items.forEach((item, i) => {
    if (values[i] && values[i].textContent !== item.value) values[i].textContent = item.value;
  });
}

function updateCanvasLabel() {
  if (!currentMeta) return;
  const stateLabel = { ready: "開始前", playing: "プレイ中", paused: "一時停止中", result: "結果表示中" }[state] || "";
  canvas.setAttribute("aria-label", `${currentMeta.title}（${currentMeta.sub}）のゲーム画面。${stateLabel}。スコア ${currentScore}。`);
}

function enterGame(meta) {
  stopLoop();
  clearGameInput();
  currentMeta = meta;
  lastPlayedId = meta.id;
  currentGame = meta.create(hooksFor(meta));
  currentScore = 0;
  resultInfo = null;
  view = "game";
  state = "ready";
  libraryView.hidden = true;
  gameView.hidden = false;
  $("#gameTitle").textContent = `${meta.title} | ${meta.sub}`;
  $("#howtoText").textContent = meta.howto;
  ctx = fitCanvas(canvas, currentGame.logicalSize.w, currentGame.logicalSize.h);
  currentGame.reset();
  buildTouchControls(meta);
  buildHud();
  overlayTitle.textContent = meta.title;
  overlayText.textContent = `${meta.sub}。スタートを押して開始します。`;
  overlayScore.hidden = true;
  primaryBtn.textContent = "スタート";
  overlay.hidden = false;
  pauseBtn.textContent = "一時停止";
  updateCanvasLabel();
  currentGame.draw(ctx);
  startLoop();
  announce(`${meta.title} を開きました。スタートボタンで開始します。`);
  primaryBtn.focus();
  window.scrollTo({ top: 0 });
  layoutGame();
}

function leaveToLibrary() {
  stopLoop();
  clearGameInput();
  currentGame = null;
  currentMeta = null;
  view = "library";
  state = "library";
  gameView.hidden = true;
  libraryView.hidden = false;
  renderLibrary();
  announce("ゲーム一覧に戻りました。");
  const target = lastPlayedId ? document.getElementById(`play-${lastPlayedId}`) : null;
  if (target) target.focus();
}

function startPlaying() {
  if (!currentGame) return;
  if (state === "result") {
    currentGame.reset();
    currentScore = 0;
    buildHud();
  }
  state = "playing";
  overlay.hidden = true;
  pauseBtn.textContent = "一時停止";
  audio.resume();
  clearGameInput();
  enableTouchControls(true);
  updateCanvasLabel();
  announce("ゲーム開始。");
  canvas.focus({ preventScroll: true });
}

function pauseGame() {
  if (state !== "playing") return;
  state = "paused";
  clearGameInput();
  enableTouchControls(false);
  audio.suspend();
  overlayTitle.textContent = "一時停止中";
  overlayText.textContent = "再開ボタン、または P / Esc キーで続けます。";
  overlayScore.hidden = true;
  primaryBtn.textContent = "再開する";
  overlay.hidden = false;
  pauseBtn.textContent = "再開";
  updateCanvasLabel();
  announce("一時停止しました。");
  primaryBtn.focus();
}

function resumeGame() {
  if (state !== "paused") return;
  state = "playing";
  overlay.hidden = true;
  pauseBtn.textContent = "一時停止";
  audio.resume();
  clearGameInput();
  enableTouchControls(true);
  updateCanvasLabel();
  announce("再開しました。");
  canvas.focus({ preventScroll: true });
}

function restartGame() {
  if (!currentGame) return;
  currentGame.reset();
  currentScore = 0;
  resultInfo = null;
  buildHud();
  state = "playing";
  overlay.hidden = true;
  pauseBtn.textContent = "一時停止";
  audio.resume();
  clearGameInput();
  enableTouchControls(true);
  currentGame.draw(ctx);
  updateCanvasLabel();
  announce("最初からやり直しました。");
  canvas.focus({ preventScroll: true });
}

// ---------- メインループ（dt 上限付き） ----------
function startLoop() {
  stopLoop();
  lastTs = performance.now();
  const frame = (ts) => {
    rafId = requestAnimationFrame(frame);
    const dt = clamp((ts - lastTs) / 1000, 0, 0.05);
    lastTs = ts;
    if (!currentGame || !ctx) return;
    if (state === "playing") {
      for (const code of keyboard.consumePressed()) currentGame.handlePressed(code);
      currentGame.update(dt, keyboard);
    } else {
      keyboard.consumePressed();
    }
    currentGame.draw(ctx);
  };
  rafId = requestAnimationFrame(frame);
}
function stopLoop() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
}

// ---------- 入力 ----------
const GAME_KEYS = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "Space", "KeyA", "KeyD", "KeyW", "KeyS", "KeyX", "KeyZ", "KeyC",
]);
window.addEventListener("keydown", (e) => {
  audio.unlock();
  if (view !== "game") return;
  if (e.code === "KeyP" || e.code === "Escape") {
    if (e.repeat) { e.preventDefault(); return; }
    if (state === "playing") { e.preventDefault(); pauseGame(); }
    else if (state === "paused") { e.preventDefault(); resumeGame(); }
    return;
  }
  const buttonSpace = e.code === "Space" && e.target instanceof HTMLElement && e.target.closest("button, a");
  if (state === "playing" && GAME_KEYS.has(e.code) && !buttonSpace) e.preventDefault();
});

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const { w, h } = currentGame.logicalSize;
  return {
    x: clamp(((e.clientX - rect.left - canvas.clientLeft) / canvas.clientWidth) * w, 0, w),
    y: clamp(((e.clientY - rect.top - canvas.clientTop) / canvas.clientHeight) * h, 0, h),
  };
}
canvas.addEventListener("pointerdown", (e) => {
  audio.unlock();
  if (state !== "playing" || !currentGame) return;
  e.preventDefault();
  canvasPointerId = e.pointerId;
  canvas.setPointerCapture?.(e.pointerId);
  const p = canvasPoint(e);
  currentGame.handlePointer(p.x, p.y, "down");
});
canvas.addEventListener("pointermove", (e) => {
  if (state !== "playing" || !currentGame) return;
  if (currentMeta.id === "star-drift" && canvasPointerId !== e.pointerId) return;
  const p = canvasPoint(e);
  currentGame.handlePointer(p.x, p.y, "move");
});
canvas.addEventListener("pointerup", (e) => {
  canvasPointerId = null;
  if (!currentGame) return;
  const p = canvasPoint(e);
  currentGame.handlePointer(p.x, p.y, "up");
});
canvas.addEventListener("pointercancel", () => {
  canvasPointerId = null;
  if (currentGame) currentGame.handlePointer(0, 0, "up");
});

// タブ切り替え・フォーカス喪失で自動一時停止（勝手に再開しない）
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") pauseGame();
});
window.addEventListener("blur", () => {
  if (state === "playing") pauseGame();
});

// ---------- ボタン配線 ----------
primaryBtn.addEventListener("click", () => {
  audio.unlock(); audio.play("ui");
  if (state === "paused") resumeGame();
  else startPlaying();
});
$("#overlayBackBtn").addEventListener("click", leaveToLibrary);
$("#backBtn").addEventListener("click", leaveToLibrary);
pauseBtn.addEventListener("click", () => {
  if (state === "playing") pauseGame();
  else if (state === "paused") resumeGame();
});
$("#restartBtn").addEventListener("click", restartGame);

const soundToggle = $("#soundToggle");
function syncSoundButton() {
  soundToggle.textContent = audio.enabled ? "サウンド ON" : "サウンド OFF";
  soundToggle.setAttribute("aria-pressed", String(audio.enabled));
}
soundToggle.addEventListener("click", () => {
  audio.setEnabled(!audio.enabled);
  saveSoundEnabled(audio.enabled);
  syncSoundButton();
  if (audio.enabled) audio.play("ui");
  announce(audio.enabled ? "サウンドをオンにしました。" : "サウンドをオフにしました。");
});
syncSoundButton();

// リサイズ時に DPR を再適用する
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentGame && view === "game") {
      ctx = fitCanvas(canvas, currentGame.logicalSize.w, currentGame.logicalSize.h);
      layoutGame();
      currentGame.draw(ctx);
    }
  }, 150);
});

const layoutObserver = new ResizeObserver(layoutGame);
layoutObserver.observe(hudBar);
layoutObserver.observe(touchControls);
layoutObserver.observe(document.querySelector(".game-toolbar"));
window.visualViewport?.addEventListener("resize", layoutGame);

// ---------- 診断用スナップショット（読み取り専用） ----------
window.arcadeDebug = Object.freeze({
  getSnapshot() {
    return {
      view,
      activeGameId: currentMeta ? currentMeta.id : null,
      state,
      score: currentScore,
      best: { ...best },
      soundEnabled: audio.enabled,
      result: resultInfo ? { ...resultInfo } : null,
      game: currentGame ? currentGame.getSnapshot() : null,
    };
  },
});

renderLibrary();
