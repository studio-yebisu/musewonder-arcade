// キーボード入力の状態管理。押下中キーと「押された瞬間」を保持する。
export function createKeyboard() {
  const down = new Set();
  const pressedQueue = [];

  function onKeyDown(e) {
    const target = e.target;
    if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement) {
      if (target.closest("input, select, textarea, [contenteditable=true]")) return;
      if (e.code === "Space" && target.closest("button, a")) return;
    }
    if (!down.has(e.code)) pressedQueue.push(e.code);
    down.add(e.code);
  }
  function onKeyUp(e) {
    down.delete(e.code);
  }
  function clearAll() {
    down.clear();
    pressedQueue.length = 0;
  }

  return {
    attach(target = window) {
      target.addEventListener("keydown", onKeyDown);
      target.addEventListener("keyup", onKeyUp);
      target.addEventListener("blur", clearAll);
    },
    detach(target = window) {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", clearAll);
    },
    isDown(code) { return down.has(code); },
    consumePressed() {
      const out = pressedQueue.slice();
      pressedQueue.length = 0;
      return out;
    },
    clear: clearAll,
  };
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
