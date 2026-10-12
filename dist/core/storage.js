// localStorage の安全なラッパー。利用不可時はメモリ上にフォールバックする。
const BEST_KEY = "muse-arcade-best-v1";
const SOUND_KEY = "muse-arcade-sound-v1";

function createMemoryStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

function resolveStore() {
  try {
    const s = window.localStorage;
    const probe = "__muse_arcade_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return createMemoryStore();
  }
}

let store = null;
function getStore() {
  if (!store) store = typeof window !== "undefined" ? resolveStore() : createMemoryStore();
  return store;
}

export function loadBestScores() {
  try {
    const raw = getStore().getItem(BEST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = Math.floor(v);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveBestScores(best) {
  try {
    getStore().setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    // 保存できなくてもゲームは続行する
  }
}

export function loadSoundEnabled() {
  try {
    // 初回は音付き。明示的に保存されたミュート設定は尊重する。
    return getStore().getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSoundEnabled(enabled) {
  try {
    getStore().setItem(SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // 保存できなくても操作は続行する
  }
}
