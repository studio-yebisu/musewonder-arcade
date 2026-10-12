import test from "node:test";
import assert from "node:assert/strict";
import { createAudio } from "../dist/core/audio.js";

function mockWindow(t, value) {
  const old = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value });
  t.after(() => {
    if (old) Object.defineProperty(globalThis, "window", old);
    else delete globalThis.window;
  });
}

test("サウンドONでも初回操作までAudioContextを作らず、ミュート時は効果音を出さない", t => {
  let contexts = 0, oscillators = 0, started = 0, resumed = 0;
  class AudioContext {
    constructor() { contexts++; this.state = "suspended"; this.currentTime = 0; this.destination = {}; }
    resume() { resumed++; this.state = "running"; return Promise.resolve(); }
    suspend() { this.state = "suspended"; return Promise.resolve(); }
    createOscillator() {
      oscillators++;
      return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect(gain) { return gain; }, start() { started++; }, stop() {} };
    }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  mockWindow(t, { AudioContext });
  const audio = createAudio();
  audio.setEnabled(true);
  assert.equal(contexts, 0, "ページの初期化では自動再生を要求しない");
  audio.unlock();
  audio.play("bounce");
  assert.equal(contexts, 1);
  assert.equal(resumed, 1);
  assert.equal(started, 1);
  audio.setEnabled(false);
  audio.unlock();
  audio.play("shoot");
  assert.equal(oscillators, 1, "ミュート中に弾の効果音を作らない");
  audio.setEnabled(true);
  audio.suspend();
  audio.resume();
  audio.play("brick");
  assert.equal(contexts, 1, "停止・再開でコンテキストを増やさない");
  assert.equal(resumed, 2);
  assert.equal(started, 2);
});

test("初回は音付きで、保存したOFF設定は再読み込み後も保持される", async t => {
  const values = new Map();
  mockWindow(t, { localStorage: {
    getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: k => values.delete(k),
  } });
  const fresh = await import("../dist/core/storage.js?audio-fresh");
  assert.equal(fresh.loadSoundEnabled(), true);
  fresh.saveSoundEnabled(false);
  const reloaded = await import("../dist/core/storage.js?audio-reloaded");
  assert.equal(reloaded.loadSoundEnabled(), false);
  reloaded.saveSoundEnabled(true);
  assert.equal(fresh.loadSoundEnabled(), true);
});

test("localStorageを使えない環境でも音の切り替えとスコア保存を続けられる", async t => {
  mockWindow(t, { get localStorage() { throw new Error("Storage blocked"); } });
  const storage = await import("../dist/core/storage.js?audio-blocked");
  assert.equal(storage.loadSoundEnabled(), true);
  storage.saveSoundEnabled(false);
  storage.saveBestScores({ "star-drift": 900 });
  assert.equal(storage.loadSoundEnabled(), false);
  assert.deepEqual(storage.loadBestScores(), { "star-drift": 900 });
});
