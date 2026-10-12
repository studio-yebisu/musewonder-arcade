// WebAudio によるシンセ効果音。初期状態はミュート、ユーザー操作で有効化する。
export function createAudio() {
  let ctx = null;
  let enabled = false;

  function ensureContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, dur = 0.08, type = "square", vol = 0.12, slideTo = null, delay = 0) {
    if (!enabled) return;
    const ac = ensureContext();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const sounds = {
    move() { tone(220, 0.03, "square", 0.05); },
    rotate() { tone(330, 0.05, "square", 0.07); },
    lock() { tone(150, 0.07, "triangle", 0.12); },
    clear() { tone(523, 0.09, "square", 0.1); tone(784, 0.12, "square", 0.1, null, 0.07); },
    bigClear() { tone(523, 0.09, "square", 0.11); tone(659, 0.09, "square", 0.11, null, 0.07); tone(880, 0.16, "square", 0.12, null, 0.14); },
    hit() { tone(180, 0.06, "sawtooth", 0.09, 90); },
    bounce() { tone(440, 0.04, "square", 0.07); },
    brick() { tone(660, 0.05, "square", 0.09, 880); },
    shoot() { tone(880, 0.05, "square", 0.05, 440); },
    explode() { tone(200, 0.18, "sawtooth", 0.13, 40); },
    hurt() { tone(140, 0.2, "sawtooth", 0.14, 60); },
    crash() { tone(110, 0.25, "sawtooth", 0.15, 45); },
    nearMiss() { tone(990, 0.06, "sine", 0.09, 1320); },
    launch() { tone(392, 0.08, "square", 0.09, 587); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, "square", 0.1, null, i * 0.11)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.16, "triangle", 0.11, null, i * 0.12)); },
    ui() { tone(587, 0.04, "sine", 0.07); },
  };

  return {
    get enabled() { return enabled; },
    setEnabled(v) {
      enabled = Boolean(v);
      if (enabled) ensureContext();
    },
    unlock() { if (enabled) ensureContext(); },
    play(name) {
      const fn = sounds[name];
      if (fn) fn();
    },
    suspend() {
      if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
    },
    resume() {
      if (enabled) ensureContext();
    },
  };
}
