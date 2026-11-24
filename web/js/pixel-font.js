/**
 * Crisp pixel text for the canvas. Silkscreen is rendered once at 8px, then
 * thresholded to 1-bit and cached, so labels stay sharp at every scale.
 */

const cache = new Map();
const MAX_CACHE = 600;
let ready = false;
let measureCtx = null;

export async function initPixelFont() {
  if (!document.fonts?.load) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('8px "Silkscreen"'),
        document.fonts.load('bold 8px "Silkscreen"'),
        document.fonts.load('16px "VT323"'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    /* fall back to monospace */
  }
  ready = true;
}

function hexToRgb(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function labelCanvas(text, color, fontPx) {
  const key = `${fontPx}|${color}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const pad = 2;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `${fontPx}px "Silkscreen", monospace`;
  const width = Math.max(1, Math.ceil(probe.measureText(text).width));
  const height = fontPx + 2;
  const canvas = document.createElement("canvas");
  canvas.width = width + pad * 2;
  canvas.height = height + 2;
  const ctx = canvas.getContext("2d");
  ctx.font = `${fontPx}px "Silkscreen", monospace`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, pad, 1);

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const [r, g, b] = hexToRgb(color);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 88) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    } else {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);

  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(key, canvas);
  return canvas;
}

/**
 * Draw pixel text. Returns the width/height used (logical px).
 */
export function drawPixelText(ctx, text, x, y, options = {}) {
  const {
    color = "#f3ead7",
    font = 8,
    scale = 1,
    align = "left",
    baseline = "top",
    shadow = null,
    alpha = 1,
    maxChars = 0,
  } = options;

  let value = String(text ?? "");
  if (maxChars && value.length > maxChars) value = value.slice(0, Math.max(1, maxChars - 1)) + "…";
  if (!value) return { width: 0, height: 0 };

  const canvas = labelCanvas(value.toUpperCase(), color, font);
  const w = canvas.width * scale;
  const h = canvas.height * scale;
  const drawX = Math.round(align === "center" ? x - w / 2 : align === "right" ? x - w : x);
  const drawY = Math.round(baseline === "bottom" ? y - h : baseline === "middle" ? y - h / 2 : y);

  const prevAlpha = ctx.globalAlpha;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (alpha !== 1) ctx.globalAlpha = prevAlpha * alpha;

  if (shadow) {
    const shadowCanvas = labelCanvas(value.toUpperCase(), shadow, font);
    ctx.drawImage(shadowCanvas, drawX + scale, drawY + scale, w, h);
  }
  ctx.drawImage(canvas, drawX, drawY, w, h);

  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmooth;
  return { width: w, height: h };
}

export function pixelTextSize(text, options = {}) {
  const { font = 8, scale = 1 } = options;
  const canvas = labelCanvas(String(text ?? "").toUpperCase(), "#fff", font);
  return { width: canvas.width * scale, height: canvas.height * scale };
}

export function fontReady() {
  return ready;
}

/**
 * Readable canvas text. VT323 keeps the terminal look but stays legible at
 * small sizes, unlike a thresholded 8px bitmap face.
 */
export function drawUiText(ctx, text, x, y, options = {}) {
  const {
    color = "#f3ead7",
    font = 14,
    align = "left",
    baseline = "top",
    maxChars = 0,
    shadow = null,
    alpha = 1,
    family = '"VT323", "Courier New", monospace',
  } = options;

  let value = String(text ?? "");
  if (maxChars && value.length > maxChars) value = value.slice(0, Math.max(1, maxChars - 1)) + "…";
  if (!value) return { width: 0, height: font };

  ctx.save();
  ctx.font = `${font}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.globalAlpha *= alpha;
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(value, x + 1, y + 1);
  }
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
  const width = ctx.measureText(value).width;
  ctx.restore();
  return { width, height: font };
}

export function uiTextSize(text, options = {}) {
  const { font = 14, family = '"VT323", "Courier New", monospace' } = options;
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  measureCtx.font = `${font}px ${family}`;
  return { width: measureCtx.measureText(String(text ?? "")).width, height: font };
}
