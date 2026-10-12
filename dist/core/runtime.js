// キャンバスの論理解像度フィットと DPR 対応。
export const MAX_DPR = 2;

export function fitCanvas(canvas, logicalW, logicalH) {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  canvas.width = Math.round(logicalW * dpr);
  canvas.height = Math.round(logicalH * dpr);
  canvas.style.aspectRatio = `${logicalW} / ${logicalH}`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// 実際に見える領域と操作ボタンの高さから、縦横比を保って収める。
export function fitGameLayout(canvas, controls, logicalW, logicalH) {
  const stage = canvas.parentElement;
  const css = getComputedStyle(canvas);
  const borderX = parseFloat(css.borderLeftWidth) + parseFloat(css.borderRightWidth);
  const borderY = parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
  const controlsCss = getComputedStyle(controls);
  const controlsHeight = controls.getBoundingClientRect().height + parseFloat(controlsCss.marginTop);
  const top = stage.getBoundingClientRect().top + window.scrollY;
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const safeBottom = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
  const availableHeight = Math.max(130, viewportHeight - top - controlsHeight - safeBottom - 24);
  const maxWidth = Math.min(520, stage.parentElement.clientWidth);
  const width = Math.floor(Math.min(maxWidth, (availableHeight - borderY) * logicalW / logicalH + borderX));
  const height = (width - borderX) * logicalH / logicalW + borderY;
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
