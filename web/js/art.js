import { drawPixelText, drawUiText } from "./pixel-font.js";
import { shade } from "./sprites.js";

export const CONTENT_W = 398;
export const CONTENT_H = 232;
export const LOUNGE_CONTENT_H = 188;

const OUTLINE = "#1a2334";
const WOOD_DARK = "#5e402c";
const WOOD = "#82583a";
const WOOD_LIGHT = "#9d6b45";

function r(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function hash32(value) {
  let h = 2166136261 >>> 0;
  const s = String(value);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function phaseFor(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 5 && h < 7.5) return "dawn";
  if (h >= 7.5 && h < 17) return "day";
  if (h >= 17 && h < 19.5) return "dusk";
  return "night";
}

export function skyPalette(phase) {
  switch (phase) {
    case "dawn":
      return { top: "#39466d", mid: "#a86b74", low: "#e8a777", sun: "#ffe0a8", cloud: "#f0c5b5", skyline: "#4b3d54", lit: "#ffd88a", star: "#dfe5ff" };
    case "day":
      return { top: "#4d9bcf", mid: "#87cae8", low: "#c8e9f2", sun: "#fff4bd", cloud: "#eefaff", skyline: "#7b99a6", lit: "#f8e9ad", star: "#ffffff" };
    case "dusk":
      return { top: "#382f5c", mid: "#8b4f76", low: "#df8267", sun: "#ffca88", cloud: "#e7b0a3", skyline: "#42344f", lit: "#ffc56f", star: "#f4e9ff" };
    default:
      return { top: "#080e22", mid: "#111c3c", low: "#1c2a50", sun: "#f6efd4", cloud: "#283352", skyline: "#141d34", lit: "#ffd884", star: "#d8e0ff" };
  }
}

function drawSky(ctx, x, y, w, h, phase, seed = 1) {
  const pal = skyPalette(phase);
  const rnd = mulberry32(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const bands = [
    [0, 0.28, pal.top],
    [0.28, 0.28, pal.mid],
    [0.56, 0.26, pal.low],
    [0.82, 0.18, shade(pal.low, 4)],
  ];
  for (const [from, size, color] of bands) {
    r(ctx, x, y + h * from, w, h * size + 1, color);
  }

  // Dither band between sky colors.
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < w; i += 4) {
    r(ctx, x + i, y + h * 0.27, 2, 1, pal.top);
    r(ctx, x + ((i + 2) % w), y + h * 0.55, 2, 1, pal.mid);
  }
  ctx.globalAlpha = 1;

  const starCount = phase === "night" ? Math.max(8, Math.round(w / 9)) : phase === "dawn" || phase === "dusk" ? 4 : 0;
  for (let i = 0; i < starCount; i++) {
    const sx = Math.round(x + 4 + rnd() * (w - 8));
    const sy = Math.round(y + 3 + rnd() * (h * 0.5));
    r(ctx, sx, sy, 1, 1, pal.star);
  }

  const sunX = Math.round(x + w * (phase === "day" ? 0.68 : 0.72));
  const sunY = Math.round(y + (phase === "day" ? h * 0.18 : phase === "night" ? h * 0.24 : h * 0.56));
  r(ctx, sunX, sunY, 10, 10, pal.sun);
  r(ctx, sunX - 2, sunY + 2, 14, 6, pal.sun);
  r(ctx, sunX + 2, sunY - 2, 6, 14, pal.sun);
  if (phase === "night") {
    r(ctx, sunX + 5, sunY - 1, 7, 12, pal.mid);
    r(ctx, sunX + 1, sunY + 3, 2, 2, shade(pal.sun, -18));
    r(ctx, sunX + 4, sunY + 7, 2, 1, shade(pal.sun, -14));
  }

  // Clouds.
  const cloudCount = phase === "day" ? 2 : 1;
  for (let i = 0; i < cloudCount; i++) {
    const cw = 18 + Math.round(rnd() * 20);
    const cx = Math.round(x + 6 + rnd() * Math.max(1, w - cw - 12));
    const cy = Math.round(y + 8 + rnd() * (h * 0.3));
    r(ctx, cx, cy, cw, 3, pal.cloud);
    r(ctx, cx + 4, cy - 2, cw - 10, 3, pal.cloud);
    r(ctx, cx + 2, cy + 3, cw - 4, 1, shade(pal.cloud, -12));
  }

  if (phase === "day" && w > 40) {
    r(ctx, x + w * 0.3, y + 12, 2, 1, "#3c4b5c");
    r(ctx, x + w * 0.3 + 3, y + 11, 2, 1, "#3c4b5c");
  }

  // Skyline.
  const baseY = y + h;
  let bx = x - 4;
  while (bx < x + w) {
    const bw = 7 + Math.round(rnd() * 12);
    const bh = 8 + Math.round(rnd() * Math.min(26, h * 0.36));
    r(ctx, bx, baseY - bh, bw, bh, pal.skyline);
    if (rnd() > 0.55) r(ctx, bx + 2, baseY - bh - 2, 1, 2, pal.skyline);
    if (phase === "night" || phase === "dusk") {
      for (let wy = baseY - bh + 3; wy < baseY - 3; wy += 4) {
        for (let wx = bx + 2; wx < bx + bw - 1; wx += 4) {
          if (rnd() > 0.56) r(ctx, wx, wy, 1, 1, pal.lit);
        }
      }
    }
    bx += bw + 1 + Math.round(rnd() * 2);
  }
  ctx.restore();
}

function drawWindow(ctx, x, y, w, h, phase, seed) {
  r(ctx, x - 3, y - 3, w + 6, h + 6, OUTLINE);
  r(ctx, x - 1, y - 1, w + 2, h + 2, "#6f543e");
  drawSky(ctx, x, y, w, h, phase, seed);
  r(ctx, x + Math.floor(w / 2) - 1, y, 2, h, "rgba(30,30,40,0.55)");
  r(ctx, x, y + Math.floor(h / 2) - 1, w, 2, "rgba(30,30,40,0.4)");
  r(ctx, x - 4, y + h + 2, w + 8, 4, "#5b432f");
  r(ctx, x - 4, y + h + 2, w + 8, 1, "#8a6a4c");
}

function drawPlate(ctx, x, y, w, title, sub, accent, crew = "") {
  const h = 36;
  r(ctx, x + 2, y + 3, w, h, "rgba(0,0,0,0.24)");
  r(ctx, x, y, w, h, "#101a2b");
  r(ctx, x, y, w, 2, accent.main);
  r(ctx, x, y + h - 2, w, 2, "#060b13");
  r(ctx, x + 2, y + 2, 3, h - 4, accent.dark);
  drawUiText(ctx, title.toUpperCase(), x + 10, y + 5, {
    color: "#f3ead7",
    font: 24,
    maxChars: 19,
    shadow: "#060b13",
  });
  if (crew) {
    drawUiText(ctx, crew.toUpperCase(), x + w - 8, y + 18, {
      color: accent.soft,
      font: 15,
      align: "right",
    });
  }
  if (sub) {
    drawUiText(ctx, sub.toUpperCase(), x + w - 8, y + 20, {
      color: "#8f9db7",
      font: 14,
      align: "right",
    });
  }
}

function drawRoomFrame(ctx, room, accent) {
  const { x, y, w, h } = room;
  r(ctx, x + 6, y + 9, w, h, "rgba(0,0,0,0.34)");
  r(ctx, x, y, w, h, "#1a2639");
  r(ctx, x + 1, y + 1, w - 2, h - 2, "#2b3d58");
  r(ctx, x + 3, y + 3, w - 6, h - 6, "#0a0f19");
  r(ctx, x, y, w, 1, "#3a5174");
  r(ctx, x, y, 1, h, "#22324b");
  r(ctx, x + w - 1, y, 1, h, "#0a101b");
  r(ctx, x, y + h - 1, w, 1, "#05090f");
  // Corner screws.
  for (const [sx, sy] of [[x + 1, y + 1], [x + w - 3, y + 1], [x + 1, y + h - 3], [x + w - 3, y + h - 3]]) {
    r(ctx, sx, sy, 2, 2, accent.dark);
    r(ctx, sx, sy, 1, 1, accent.main);
  }
}

function drawOfficeWalls(ctx, room, phase) {
  const { cx, cy, cw } = room;
  r(ctx, cx, cy, cw, 132, "#d7c3a0");
  r(ctx, cx, cy, cw, 8, "#ead9bb");
  r(ctx, cx, cy + 8, cw, 1, "#c0a883");

  // Wallpaper stripes.
  ctx.globalAlpha = 0.35;
  for (let x = 0; x < cw; x += 16) r(ctx, cx + x, cy + 9, 1, 100, "#c9b28d");
  ctx.globalAlpha = 1;

  // Wainscot.
  r(ctx, cx, cy + 112, cw, 20, "#c9b28e");
  r(ctx, cx, cy + 112, cw, 2, "#a88a66");
  for (let x = 12; x < cw; x += 24) r(ctx, cx + x, cy + 116, 1, 14, "#bca37c");

  // Baseboard.
  r(ctx, cx, cy + 130, cw, 4, "#7c5b40");
  r(ctx, cx, cy + 130, cw, 1, "#a37b56");
  r(ctx, cx, cy + 134, cw, 2, "rgba(30,20,15,0.28)");

  // Floor.
  const tile = 16;
  for (let ty = 134; ty < CONTENT_H; ty += tile) {
    for (let tx = 0; tx < cw; tx += tile) {
      const odd = ((tx / tile) + (ty / tile)) % 2 === 0;
      r(ctx, cx + tx, cy + ty, tile, tile, odd ? "#c79c6e" : "#d1aa7c");
    }
  }
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 16; i++) {
    const hx = hash32(`${room.id}:floor:${i}`);
    r(ctx, cx + (hx % cw), cy + 138 + ((hx >>> 8) % 88), 2 + (hx % 3), 1, "#8c6949");
  }
  ctx.globalAlpha = 1;

  // Warm light from the window.
  ctx.fillStyle = "rgba(255,238,190,0.10)";
  ctx.beginPath();
  ctx.moveTo(cx + 294, cy + 100);
  ctx.lineTo(cx + 380, cy + 100);
  ctx.lineTo(cx + 350, cy + 232);
  ctx.lineTo(cx + 210, cy + 232);
  ctx.closePath();
  ctx.fill();

  // Rug.
  r(ctx, cx + 22, cy + 199, cw - 44, 33, room.accent.dark);
  r(ctx, cx + 24, cy + 201, cw - 48, 29, shade(room.accent.main, -28));
  r(ctx, cx + 27, cy + 204, cw - 54, 23, shade(room.accent.main, -36));
  ctx.globalAlpha = 0.28;
  for (let x = cx + 30; x < cx + cw - 32; x += 12) {
    r(ctx, x, cy + 205, 2, 21, room.accent.soft);
  }
  ctx.globalAlpha = 1;
  for (let x = cx + 22; x < cx + cw - 20; x += 8) {
    r(ctx, x, cy + 198, 3, 1, room.accent.dark);
    r(ctx, x, cy + 231, 3, 1, room.accent.dark);
  }

  // Door.
  r(ctx, cx + 6, cy + 84, 30, 48, "#6b4d34");
  r(ctx, cx + 8, cy + 86, 26, 46, "#3a2a20");
  r(ctx, cx + 10, cy + 88, 22, 42, "#2b2019");
  r(ctx, cx + 27, cy + 108, 2, 2, "#d7b56a");
  drawUiText(ctx, "EXIT", cx + 21, cy + 72, { color: "#8f9db7", font: 13, align: "center" });

  // Ceiling lamps.
  for (const lx of [cx + 70, cx + 246]) {
    r(ctx, lx, cy, 2, 4, "#4d3a29");
    r(ctx, lx - 12, cy + 4, 26, 3, "#3e3328");
    r(ctx, lx - 10, cy + 7, 22, 2, "#f6d38b");
  }

  // Window.
  drawWindow(ctx, cx + 294, cy + 38, 86, 60, phase, hash32(room.id));

  // Whiteboard.
  r(ctx, cx + 42, cy + 48, 108, 56, "#3d302a");
  r(ctx, cx + 44, cy + 50, 104, 52, "#e9e4d4");
  r(ctx, cx + 44, cy + 50, 104, 1, "#fbf8ef");
  ctx.globalAlpha = 0.35;
  for (let gx = 52; gx < 146; gx += 10) r(ctx, gx, cy + 52, 1, 48, "#b9b5a6");
  for (let gy = 56; gy < 100; gy += 10) r(ctx, cx + 46, cy + gy, 100, 1, "#b9b5a6");
  ctx.globalAlpha = 1;
  // Diagram.
  r(ctx, cx + 50, cy + 58, 20, 12, "#3d6b8e");
  r(ctx, cx + 76, cy + 58, 22, 12, "#4c8a6e");
  r(ctx, cx + 104, cy + 58, 18, 12, "#a56d3e");
  r(ctx, cx + 70, cy + 70, 2, 10, "#5b6676");
  r(ctx, cx + 72, cy + 80, 38, 2, "#5b6676");
  r(ctx, cx + 110, cy + 70, 2, 10, "#5b6676");
  r(ctx, cx + 56, cy + 84, 4, 1, "#8d97a6");
  r(ctx, cx + 56, cy + 88, 22, 1, "#8d97a6");
  r(ctx, cx + 82, cy + 88, 12, 1, "#8d97a6");
  r(ctx, cx + 50, cy + 56, 3, 3, room.accent.main);
  r(ctx, cx + 84, cy + 56, 3, 3, "#e2a64a");
  // Sticky notes.
  r(ctx, cx + 130, cy + 78, 12, 12, "#e9c25a");
  r(ctx, cx + 132, cy + 81, 8, 1, "#7a6327");
  r(ctx, cx + 132, cy + 84, 6, 1, "#7a6327");
  r(ctx, cx + 124, cy + 92, 10, 8, "#d97b72");

  // Poster.
  const variant = hash32(room.id) % 4;
  drawPoster(ctx, cx + 162, cy + 44, 52, 66, variant, room.accent);

  // Clock body.
  r(ctx, cx + 242, cy + 42, 24, 24, "#2a3345");
  r(ctx, cx + 244, cy + 44, 20, 20, "#e8e2d2");
  r(ctx, cx + 252, cy + 46, 2, 2, "#2a3345");
  r(ctx, cx + 252, cy + 62, 2, 1, "#2a3345");

  // Shelf.
  r(ctx, cx + 224, cy + 76, 60, 4, WOOD);
  r(ctx, cx + 224, cy + 80, 60, 2, WOOD_DARK);
  r(ctx, cx + 228, cy + 68, 5, 8, room.accent.main);
  r(ctx, cx + 234, cy + 66, 4, 10, "#d9a05e");
  r(ctx, cx + 239, cy + 70, 5, 6, "#6f8fbd");
  r(ctx, cx + 247, cy + 72, 4, 4, "#c96f66");
  // Small plant on shelf.
  r(ctx, cx + 264, cy + 68, 8, 8, "#a95d3f");
  r(ctx, cx + 265, cy + 66, 6, 3, "#4f8a4b");
  r(ctx, cx + 266, cy + 63, 4, 4, "#67a85c");
  r(ctx, cx + 262, cy + 65, 3, 4, "#67a85c");

  // Plants and props.
  drawPlant(ctx, cx + 15, cy + 232, 1, hash32(room.id) % 3);
  drawPlant(ctx, cx + 389, cy + 232, 1, (hash32(room.id) + 2) % 3);
  drawTrash(ctx, cx + 126, cy + 230);
  drawPrinterStand(ctx, cx + 260, cy + 230);

  // Cables.
  r(ctx, cx + 150, cy + 214, 36, 1, "#4a3a2c");
  r(ctx, cx + 150, cy + 216, 18, 1, "#4a3a2c");
  r(ctx, cx + 40, cy + 224, 22, 1, "#57432f");
}

function drawPoster(ctx, x, y, w, h, variant, accent) {
  r(ctx, x, y, w, h, "#2c2530");
  r(ctx, x + 2, y + 2, w - 4, h - 4, "#d9cfb8");
  r(ctx, x + 2, y + 2, w - 4, 1, "#f2ecdc");
  const ix = x + 4;
  const iy = y + 4;
  const iw = w - 8;
  const ih = h - 8;
  if (variant === 0) {
    r(ctx, ix, iy, iw, ih * 0.55, "#6d5a86");
    r(ctx, ix, iy + ih * 0.55, iw, ih * 0.45, "#db8a64");
    r(ctx, ix, iy + ih * 0.55, iw, 3, "#f2b678");
    r(ctx, ix + iw * 0.55, iy + 7, 8, 8, "#ffd77d");
    r(ctx, ix, iy + ih - 12, iw, 12, "#31484a");
    r(ctx, ix + 6, iy + ih - 15, 10, 4, "#3d5c58");
  } else if (variant === 1) {
    r(ctx, ix, iy, iw, ih, "#151d2b");
    drawPixelText(ctx, "{ }", ix + iw / 2, iy + 8, { color: accent.soft, scale: 2, align: "center" });
    r(ctx, ix + 6, iy + ih - 8, iw - 12, 1, accent.dark);
    r(ctx, ix + 6, iy + ih - 5, iw - 18, 1, accent.dark);
  } else if (variant === 2) {
    r(ctx, ix, iy, iw, ih, "#172238");
    for (let i = 0; i < 8; i++) {
      const sx = ix + 3 + ((i * 13 + 5) % Math.max(1, iw - 6));
      const sy = iy + 4 + ((i * 9 + 3) % Math.max(1, ih - 18));
      r(ctx, sx, sy, 1, 1, "#d9e6ff");
    }
    r(ctx, ix + iw / 2 - 5, iy + ih - 20, 10, 15, "#d9d3c1");
    r(ctx, ix + iw / 2 - 5, iy + ih - 24, 10, 5, "#b8544d");
    r(ctx, ix + iw / 2 - 2, iy + ih - 5, 4, 4, "#ef9d4d");
  } else {
    r(ctx, ix, iy, iw, ih, "#243a4c");
    r(ctx, ix, iy + ih - 10, iw, 10, "#1b2c36");
    const peaks = [[4, 18], [16, 10], [30, 22]];
    for (const [px, ph] of peaks) {
      for (let i = 0; i < ph; i++) r(ctx, ix + px + i, iy + ih - 10 - ph + i, 1, ph - i, "#5f7c79");
    }
    r(ctx, ix + iw - 12, iy + 5, 6, 6, "#e8d9a2");
  }
}

function drawPlant(ctx, x, y, scale = 1, variant = 0) {
  const s = scale;
  r(ctx, x - 6 * s, y - 10 * s, 12 * s, 10 * s, "#9c5b3d");
  r(ctx, x - 7 * s, y - 11 * s, 14 * s, 3 * s, "#b86e49");
  r(ctx, x - 5 * s, y - 2 * s, 10 * s, 2 * s, "rgba(0,0,0,0.18)");
  const leaf = variant === 1 ? "#4f7e3e" : variant === 2 ? "#3f7256" : "#4e8a45";
  const leafLight = shade(leaf, 20);
  r(ctx, x - 1 * s, y - 26 * s, 2 * s, 16 * s, "#3d6136");
  r(ctx, x - 8 * s, y - 30 * s, 8 * s, 8 * s, leaf);
  r(ctx, x + 1 * s, y - 34 * s, 8 * s, 10 * s, leafLight);
  r(ctx, x - 6 * s, y - 38 * s, 7 * s, 9 * s, leaf);
  r(ctx, x + 2 * s, y - 25 * s, 7 * s, 6 * s, leaf);
  r(ctx, x - 9 * s, y - 23 * s, 6 * s, 6 * s, leafLight);
  r(ctx, x - 3 * s, y - 34 * s, 2 * s, 2 * s, shade(leaf, 28));
}

function drawTrash(ctx, x, y) {
  r(ctx, x - 5, y - 14, 10, 14, "#4f5a68");
  r(ctx, x - 6, y - 15, 12, 3, "#66717f");
  r(ctx, x - 3, y - 11, 6, 1, "#2f3740");
}

function drawPrinterStand(ctx, x, y) {
  r(ctx, x - 12, y - 24, 24, 24, "#5e4632");
  r(ctx, x - 12, y - 24, 24, 2, "#856344");
  r(ctx, x - 8, y - 34, 16, 10, "#c7c3b6");
  r(ctx, x - 8, y - 34, 16, 2, "#e6e2d5");
  r(ctx, x - 5, y - 30, 10, 5, "#4b5664");
  r(ctx, x + 4, y - 35, 1, 1, "#5ad4b2");
}

function drawDesk(ctx, deskX, accent, variant) {
  const y = 212;
  // Shadow.
  r(ctx, deskX - 46, y + 18, 92, 4, "rgba(0,0,0,0.18)");
  r(ctx, deskX - 46, y, 92, 5, WOOD_LIGHT);
  r(ctx, deskX - 46, y, 92, 1, "#bd8558");
  r(ctx, deskX - 44, y + 5, 88, 16, WOOD);
  r(ctx, deskX - 44, y + 5, 88, 2, WOOD_DARK);
  // Drawers.
  r(ctx, deskX - 40, y + 8, 30, 10, WOOD_DARK);
  r(ctx, deskX - 40, y + 8, 30, 1, "#a0714b");
  r(ctx, deskX - 27, y + 12, 5, 1, "#d7ad76");
  r(ctx, deskX + 6, y + 8, 32, 10, WOOD_DARK);
  r(ctx, deskX + 6, y + 8, 32, 1, "#a0714b");
  r(ctx, deskX + 18, y + 12, 7, 1, "#d7ad76");
  r(ctx, deskX - 44, y + 20, 88, 1, "#4a3224");
  r(ctx, deskX - 44, y + 21, 88, 2, "#4a3224");
  // Legs.
  r(ctx, deskX - 40, y + 23, 5, 5, WOOD_DARK);
  r(ctx, deskX + 35, y + 23, 5, 5, WOOD_DARK);

  // Monitor.
  const mx = deskX - 48;
  r(ctx, mx, 186, 28, 26, OUTLINE);
  r(ctx, mx + 1, 187, 26, 24, "#2e3849");
  r(ctx, mx + 3, 189, 22, 18, "#0c1620");
  r(ctx, mx + 4, 190, 20, 16, "#101d27");
  r(ctx, mx + 12, 213, 4, 3, "#39465a");
  r(ctx, mx + 7, 216, 14, 1, "#1d2634");
  r(ctx, mx + 23, 193, 1, 1, accent.main);

  // Keyboard.
  r(ctx, deskX - 9, 208, 34, 4, "#3b4453");
  r(ctx, deskX - 8, 208, 32, 1, "#5d6a7d");
  for (let kx = deskX - 6; kx < deskX + 22; kx += 4) r(ctx, kx, 210, 2, 1, "#222b38");

  // Mug.
  r(ctx, deskX + 28, 205, 7, 7, variant % 2 ? "#d9a05e" : "#8fb7a5");
  r(ctx, deskX + 29, 205, 5, 1, "#efe7d4");
  r(ctx, deskX + 35, 207, 2, 3, "#6d7a86");

  // Sticky note.
  r(ctx, deskX - 20, 199, 7, 6, variant % 3 === 0 ? "#e9c25a" : "#d9a9c4");
}

export function drawDeskFront(ctx, room, seat, accent) {
  const deskX = room.cx + [74, 198, 322][seat];
  const y = 216;
  r(ctx, deskX - 44, y, 88, 14, WOOD);
  r(ctx, deskX - 44, y, 88, 2, WOOD_DARK);
  r(ctx, deskX - 40, y + 4, 30, 8, WOOD_DARK);
  r(ctx, deskX - 40, y + 4, 30, 1, "#a0714b");
  r(ctx, deskX - 27, y + 7, 5, 1, "#d7ad76");
  r(ctx, deskX + 6, y + 4, 32, 8, WOOD_DARK);
  r(ctx, deskX + 6, y + 4, 32, 1, "#a0714b");
  r(ctx, deskX + 18, y + 7, 7, 1, "#d7ad76");
  r(ctx, deskX - 44, y + 13, 88, 1, "#3f2b20");
  if (seat === 1) {
    r(ctx, deskX + 22, y + 6, 8, 2, accent.soft);
    r(ctx, deskX + 22, y + 9, 5, 1, accent.soft);
  }
}

export function drawMonitorScreen(ctx, room, seat, agent, t) {
  const deskX = room.cx + [74, 198, 322][seat];
  const x = deskX - 45;
  const y = 190;
  const w = 20;
  const h = 16;
  const status = agent?.status || "idle";
  const color = status === "attention" ? "#ef7464" : status === "working" ? room.accent.soft : "#4b6070";
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  r(ctx, x, y, w, h, status === "working" ? "#122a2a" : "#0d161e");
  const scroll = Math.floor((t || 0) / (status === "working" ? 300 : 1400)) + hash32(agent?.id || seat) % 12;
  for (let line = 0; line < 7; line++) {
    const ly = y + 2 + line * 2;
    const base = hash32(`${agent?.id || room.id}:${seat}:${line}`) % 16;
    const indent = base % 4;
    r(ctx, x + 2 + indent, ly, Math.max(2, (base % 9) + 2), 1, color);
    if (base % 3 === 0) r(ctx, x + 4 + indent + (base % 7), ly, 3, 1, "#8a9bb0");
    if (status === "attention" && line === (scroll % 7)) r(ctx, x, ly, w, 1, "rgba(239,116,100,0.2)");
  }
  if (status === "working") {
    r(ctx, x + 2 + (scroll % 12), y + 2 + ((scroll * 3) % 12), 2, 1, "#f3ead7");
  }
  if (status === "attention") {
    r(ctx, x + w - 4, y + 2, 2, 2, "#ef7464");
    r(ctx, x + w - 3, y + 3, 1, 1, "#f3ead7");
  }
  ctx.restore();
  // Screen glow.
  if (status === "working" || status === "attention") {
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = 0.06;
    r(ctx, x - 3, y - 3, w + 6, h + 6, color);
    ctx.globalAlpha = prev;
  }
}

function drawClockHands(ctx, x, y, t) {
  const date = new Date(t || Date.now());
  const minute = date.getMinutes();
  const hour = date.getHours() % 12;
  const mx = x + 12 + Math.round(Math.sin((minute / 60) * Math.PI * 2) * 7);
  const my = y + 12 - Math.round(Math.cos((minute / 60) * Math.PI * 2) * 7);
  const hx = x + 12 + Math.round(Math.sin(((hour + minute / 60) / 12) * Math.PI * 2) * 4);
  const hy = y + 12 - Math.round(Math.cos(((hour + minute / 60) / 12) * Math.PI * 2) * 4);
  const line = (x1, y1, x2, y2, color) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= steps; i++) {
      const px = Math.round(x1 + ((x2 - x1) * i) / (steps || 1));
      const py = Math.round(y1 + ((y2 - y1) * i) / (steps || 1));
      r(ctx, px, py, 1, 1, color);
    }
  };
  line(x + 12, y + 12, hx, hy, "#3a3a48");
  line(x + 12, y + 12, mx, my, "#3a3a48");
  r(ctx, x + 11, y + 11, 2, 2, "#a1533f");
}

export function drawOfficeRoom(ctx, room, phase) {
  const accent = room.accent;
  drawRoomFrame(ctx, room, accent);
  ctx.save();
  ctx.beginPath();
  ctx.rect(room.cx, room.cy, room.cw, CONTENT_H);
  ctx.clip();
  drawOfficeWalls(ctx, room, phase);

  // Desks.
  for (let seat = 0; seat < 3; seat++) {
    drawDesk(ctx, room.cx + [74, 198, 322][seat], accent, (hash32(room.id) + seat) % 3);
  }

  // Nameplate last so it sits above the wallpaper.
  const crew = `${room.agentCount || 0} CREW`;
  drawPlate(ctx, room.cx + 10, room.cy + 8, 274, room.name, "", accent, crew);
  drawUiText(ctx, `F7-${String(room.index + 1).padStart(2, "0")}`, room.cx + 282, room.cy + 78, {
    color: "#4c5a72", font: 13, align: "right",
  });

  ctx.restore();
  drawRoomClock(ctx, room, phase);
}

function drawRoomClock(ctx, room, phase) {
  if (phase === "night") {
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = 0.1;
    r(ctx, room.cx + 236, room.cy + 36, 36, 36, "#ffd884");
    ctx.globalAlpha = prev;
  }
  drawClockHands(ctx, room.cx + 242, room.cy + 42, Date.now());
}

function drawBench(ctx, x, y) {
  r(ctx, x, y - 16, 62, 5, WOOD_LIGHT);
  r(ctx, x, y - 11, 62, 3, WOOD);
  r(ctx, x + 3, y - 18, 56, 3, WOOD);
  r(ctx, x + 6, y - 8, 4, 8, WOOD_DARK);
  r(ctx, x + 52, y - 8, 4, 8, WOOD_DARK);
}

function drawTree(ctx, x, y, seed) {
  const rnd = mulberry32(seed);
  r(ctx, x - 7, y - 54, 14, 54, "#5b3d2b");
  r(ctx, x - 4, y - 54, 8, 54, "#6c4933");
  r(ctx, x - 20, y - 8, 8, 8, "#4a3528");
  r(ctx, x + 12, y - 6, 8, 6, "#4a3528");
  const canopy = [
    { x: -34, y: -82, w: 38, h: 30 },
    { x: -10, y: -104, w: 46, h: 36 },
    { x: 14, y: -86, w: 34, h: 34 },
    { x: -42, y: -62, w: 36, h: 26 },
    { x: 10, y: -62, w: 38, h: 26 },
    { x: -16, y: -76, w: 40, h: 30 },
  ];
  for (const [i, c] of canopy.entries()) {
    r(ctx, x + c.x, y + c.y, c.w, c.h, i % 2 ? "#3e7c47" : "#4e8e50");
    r(ctx, x + c.x + 3, y + c.y + 3, c.w - 8, c.h - 9, i % 2 ? "#4e9557" : "#5da25e");
  }
  for (let i = 0; i < 14; i++) {
    r(ctx, x - 34 + Math.round(rnd() * 74), y - 100 + Math.round(rnd() * 48), 2, 2, "#74b46b");
  }
  // Flowers at the base.
  for (let i = 0; i < 4; i++) {
    r(ctx, x - 24 + i * 15, y - 4 + (i % 2) * 3, 2, 3, "#4e8e50");
    r(ctx, x - 24 + i * 15, y - 6 + (i % 2) * 3, 2, 2, i % 2 ? "#f2b24c" : "#ef7464");
  }
}

export function drawGarden(ctx, room, phase) {
  const accent = room.accent;
  drawRoomFrame(ctx, room, accent);
  const rnd = mulberry32(hash32(room.id));
  ctx.save();
  ctx.beginPath();
  ctx.rect(room.cx, room.cy, room.cw, CONTENT_H);
  ctx.clip();

  drawSky(ctx, room.cx, room.cy, room.cw, 150, phase, hash32(room.id) + 9);
  r(ctx, room.cx, room.cy + 146, room.cw, 4, "#3d5b3c");
  // Grass.
  for (let ty = 150; ty < CONTENT_H; ty += 12) {
    for (let tx = 0; tx < room.cw; tx += 12) {
      const odd = ((tx / 12) + (ty / 12)) % 2 === 0;
      r(ctx, room.cx + tx, room.cy + ty, 12, 12, odd ? "#5f8f4e" : "#689a56");
    }
  }
  // Path.
  r(ctx, room.cx + 130, room.cy + 166, 130, 26, "#b49a78");
  for (let i = 0; i < 5; i++) r(ctx, room.cx + 136 + i * 24, room.cy + 171 + (i % 2) * 8, 18, 10, "#cbb18a");
  // Hedge at back.
  for (let x = 0; x < room.cw; x += 14) {
    r(ctx, room.cx + x, room.cy + 140, 14, 10, x % 28 ? "#3f6b3e" : "#4a7a45");
    r(ctx, room.cx + x + 2, room.cy + 136, 10, 4, "#4a7a45");
  }

  const variant = hash32(room.id) % 3;
  if (variant === 0) {
    drawTree(ctx, room.cx + 112, room.cy + 186, hash32(room.id));
    drawBench(ctx, room.cx + 236, room.cy + 192);
  } else if (variant === 1) {
    drawTree(ctx, room.cx + 296, room.cy + 188, hash32(room.id));
    drawBench(ctx, room.cx + 52, room.cy + 192);
    r(ctx, room.cx + 170, room.cy + 168, 56, 22, "#4d7590");
    r(ctx, room.cx + 172, room.cy + 170, 52, 18, "#5f8fa8");
    r(ctx, room.cx + 180, room.cy + 174, 12, 1, "#a5d0d8");
    r(ctx, room.cx + 200, room.cy + 181, 14, 1, "#a5d0d8");
  } else {
    drawTree(ctx, room.cx + 96, room.cy + 182, hash32(room.id));
    drawTree(ctx, room.cx + 306, room.cy + 190, hash32(room.id) + 4);
    drawBench(ctx, room.cx + 174, room.cy + 194);
  }

  // Flower beds.
  for (let i = 0; i < 12; i++) {
    const fx = room.cx + 18 + Math.round(rnd() * (room.cw - 36));
    const fy = room.cy + 158 + Math.round(rnd() * 68);
    if (fx > room.cx + 120 && fx < room.cx + 280 && fy > room.cy + 160 && fy < room.cy + 200) continue;
    r(ctx, fx, fy, 1, 3, "#3f6b3e");
    r(ctx, fx - 1, fy, 3, 1, i % 3 === 0 ? "#f2b24c" : i % 3 === 1 ? "#ef7464" : "#e6dff0");
  }

  // Lamp post.
  const lx = room.cx + 350;
  r(ctx, lx, room.cy + 132, 2, 66, "#3b3a42");
  r(ctx, lx - 7, room.cy + 126, 16, 8, "#2b2a31");
  r(ctx, lx - 5, room.cy + 128, 12, 5, "#ffd884");
  if (phase === "night" || phase === "dusk") {
    ctx.globalAlpha = 0.14;
    r(ctx, lx - 16, room.cy + 122, 34, 30, "#ffd884");
    ctx.globalAlpha = 1;
  }

  // String lights.
  const ly = room.cy + 16;
  r(ctx, room.cx + 10, ly, room.cw - 20, 1, "#3e4a5e");
  for (let i = 0; i < 9; i++) {
    const bx = room.cx + 26 + i * 43;
    const by = ly + 3 + (i % 2) * 3;
    r(ctx, bx, by, 2, 3, phase === "night" ? "#ffe0a0" : "#f2d49a");
    if (phase === "night") {
      ctx.globalAlpha = 0.16;
      r(ctx, bx - 4, by - 2, 10, 8, "#ffd884");
      ctx.globalAlpha = 1;
    }
  }

  drawPlate(ctx, room.cx + 10, room.cy + 8, 160, "GARDEN", "QUIET LOT", accent);
  ctx.restore();
}

function drawLoungeWindow(ctx, x, y, w, h, phase, seed) {
  drawWindow(ctx, x, y, w, h, phase, seed);
}

function drawCouch(ctx, x, y) {
  r(ctx, x, y, 176, 10, "rgba(0,0,0,0.18)");
  // Back.
  r(ctx, x, y - 54, 176, 42, "#2f2530");
  r(ctx, x + 2, y - 52, 172, 38, "#9d4f42");
  r(ctx, x + 6, y - 48, 76, 32, "#b25b4b");
  r(ctx, x + 90, y - 48, 78, 32, "#a85446");
  r(ctx, x + 10, y - 44, 68, 2, "#c76b58");
  r(ctx, x + 94, y - 44, 70, 2, "#bf6452");
  // Seat.
  r(ctx, x, y - 14, 176, 18, "#8e463c");
  r(ctx, x + 4, y - 12, 78, 13, "#b25b4b");
  r(ctx, x + 92, y - 12, 78, 13, "#a85446");
  // Arms.
  r(ctx, x - 6, y - 46, 14, 50, "#7c3c35");
  r(ctx, x + 168, y - 46, 14, 50, "#7c3c35");
  r(ctx, x - 6, y - 46, 14, 4, "#a85446");
  r(ctx, x + 168, y - 46, 14, 4, "#a85446");
  // Legs.
  r(ctx, x + 10, y + 4, 6, 8, WOOD_DARK);
  r(ctx, x + 160, y + 4, 6, 8, WOOD_DARK);
  // Throw pillow.
  r(ctx, x + 14, y - 40, 24, 20, "#e0a45c");
  r(ctx, x + 16, y - 38, 20, 16, "#f0bd78");
  r(ctx, x + 30, y - 38, 4, 16, "#d0914b");
  // Cat.
  r(ctx, x + 132, y - 24, 16, 8, "#d78a4c");
  r(ctx, x + 130, y - 27, 9, 7, "#e09a58");
  r(ctx, x + 130, y - 29, 2, 3, "#d78a4c");
  r(ctx, x + 135, y - 29, 2, 3, "#d78a4c");
  r(ctx, x + 148, y - 23, 7, 2, "#b8713d");
  r(ctx, x + 132, y - 25, 1, 1, "#352b2b");
}

export function drawLoungeCouchFront(ctx, lounge) {
  // Seated agents are drawn between the couch base and this layer, so the
  // seat reads in front of their legs and they look like they are sitting.
  const x = lounge.cx + 42;
  const y = lounge.cy + 172;
  r(ctx, x, y - 14, 176, 18, "#8e463c");
  r(ctx, x + 4, y - 12, 78, 13, "#b25b4b");
  r(ctx, x + 92, y - 12, 78, 13, "#a85446");
  r(ctx, x + 10, y + 4, 6, 8, WOOD_DARK);
  r(ctx, x + 160, y + 4, 6, 8, WOOD_DARK);
  r(ctx, x - 6, y - 46, 14, 50, "#7c3c35");
  r(ctx, x + 168, y - 46, 14, 50, "#7c3c35");
  r(ctx, x - 6, y - 46, 14, 4, "#a85446");
  r(ctx, x + 168, y - 46, 14, 4, "#a85446");
}

function drawCoffeeBar(ctx, x, y) {
  // Counter.
  r(ctx, x, y - 20, 120, 20, "#5d4632");
  r(ctx, x, y - 22, 120, 4, "#9a7550");
  r(ctx, x + 4, y - 8, 112, 4, "#3f2f23");
  // Machine.
  r(ctx, x + 26, y - 52, 38, 30, "#2b3341");
  r(ctx, x + 28, y - 50, 34, 22, "#465465");
  r(ctx, x + 31, y - 47, 12, 6, "#131c26");
  r(ctx, x + 47, y - 47, 10, 4, "#8f9db7");
  r(ctx, x + 32, y - 37, 8, 4, "#c7a46f");
  r(ctx, x + 50, y - 36, 6, 3, "#5ad4b2");
  r(ctx, x + 40, y - 22, 2, 2, "#e8e2d2");
  // Cups.
  for (let i = 0; i < 4; i++) r(ctx, x + 74 + i * 9, y - 30, 5, 6, i % 2 ? "#d9cbb5" : "#8fb7a5");
  // Menu board.
  r(ctx, x + 20, y - 92, 72, 32, "#1a2333");
  r(ctx, x + 22, y - 90, 68, 28, "#263449");
  r(ctx, x + 28, y - 84, 24, 2, "#e8d9ba");
  r(ctx, x + 28, y - 78, 40, 1, "#8f9db7");
  r(ctx, x + 28, y - 74, 32, 1, "#8f9db7");
  r(ctx, x + 28, y - 70, 36, 1, "#8f9db7");
  // Stools.
  r(ctx, x + 10, y + 2, 3, 10, "#3f2f23");
  r(ctx, x + 4, y - 2, 16, 4, "#b25b4b");
  r(ctx, x + 98, y + 2, 3, 10, "#3f2f23");
  r(ctx, x + 92, y - 2, 16, 4, "#b25b4b");
}

function drawPingPong(ctx, x, y) {
  // Mat.
  r(ctx, x - 42, y - 38, 264, 46, "#27453b");
  r(ctx, x - 40, y - 36, 260, 42, "#31574a");
  // Legs.
  r(ctx, x + 4, y - 6, 4, 12, "#2b2b35");
  r(ctx, x + 174, y - 6, 4, 12, "#2b2b35");
  r(ctx, x + 4, y - 16, 4, 10, "#2b2b35");
  r(ctx, x + 174, y - 16, 4, 10, "#2b2b35");
  // Top.
  r(ctx, x, y - 44, 180, 30, "#1f4e63");
  r(ctx, x + 2, y - 42, 176, 26, "#2b6d80");
  r(ctx, x + 2, y - 42, 176, 2, "#4b95a5");
  r(ctx, x + 88, y - 44, 4, 30, "#d9e3e0");
  r(ctx, x + 88, y - 40, 4, 3, "#f4f7ef");
  r(ctx, x + 2, y - 29, 176, 1, "#d9e3e0");
  // Paddles on the table.
  r(ctx, x + 24, y - 36, 12, 6, "#e8e2d2");
  r(ctx, x + 24, y - 30, 3, 5, "#9d6b45");
  r(ctx, x + 142, y - 34, 12, 6, "#e8e2d2");
  r(ctx, x + 154, y - 30, 3, 5, "#9d6b45");
  // Ball.
  r(ctx, x + 88, y - 50, 3, 3, "#f6f3df");
}

function drawBookshelf(ctx, x, y) {
  r(ctx, x, y - 96, 68, 96, "#3b2d26");
  r(ctx, x + 3, y - 93, 62, 90, "#241d1b");
  for (let shelf = 0; shelf < 4; shelf++) {
    const sy = y - 90 + shelf * 22;
    r(ctx, x + 5, sy + 18, 58, 3, WOOD);
    for (let i = 0; i < 6; i++) {
      const bh = 10 + ((i * 7 + shelf * 5) % 8);
      r(ctx, x + 8 + i * 8, sy + 18 - bh, 5, bh, ["#b25b4b", "#5f8fa8", "#c8a05a", "#6b8f6b", "#8c7bb8"][(i + shelf) % 5]);
    }
  }
}

function drawBeanbag(ctx, x, y) {
  r(ctx, x, y - 26, 42, 22, "#3f5d75");
  r(ctx, x + 4, y - 30, 34, 16, "#527a94");
  r(ctx, x + 8, y - 32, 26, 6, "#6390aa");
  r(ctx, x + 6, y - 5, 30, 4, "rgba(0,0,0,0.18)");
}

function drawLoungeCat(ctx, x, y) {
  // A second cat, asleep by the window.
  r(ctx, x, y - 8, 18, 8, "#d9c7a4");
  r(ctx, x + 2, y - 12, 9, 6, "#e8d7b3");
  r(ctx, x + 2, y - 15, 2, 4, "#d9c7a4");
  r(ctx, x + 8, y - 15, 2, 4, "#d9c7a4");
  r(ctx, x + 4, y - 11, 1, 1, "#4a3c34");
  r(ctx, x + 8, y - 11, 1, 1, "#4a3c34");
  r(ctx, x + 16, y - 6, 6, 2, "#c4b08e");
}

export function drawLounge(ctx, lounge, phase) {
  const accent = lounge.accent;
  drawRoomFrame(ctx, lounge, accent);
  ctx.save();
  ctx.beginPath();
  ctx.rect(lounge.cx, lounge.cy, lounge.cw, LOUNGE_CONTENT_H);
  ctx.clip();

  // Wall.
  r(ctx, lounge.cx, lounge.cy, lounge.cw, 104, "#26324a");
  r(ctx, lounge.cx, lounge.cy, lounge.cw, 8, "#313e58");
  r(ctx, lounge.cx, lounge.cy + 8, lounge.cw, 1, "#3b4a66");
  for (let x = 0; x < lounge.cw; x += 22) r(ctx, lounge.cx + x, lounge.cy + 9, 1, 88, "rgba(20,28,44,0.5)");
  r(ctx, lounge.cx, lounge.cy + 100, lounge.cw, 6, "#1a2438");

  // Floor.
  for (let ty = 106; ty < LOUNGE_CONTENT_H; ty += 14) {
    for (let tx = 0; tx < lounge.cw; tx += 14) {
      const odd = ((tx / 14) + (ty / 14)) % 2 === 0;
      r(ctx, lounge.cx + tx, lounge.cy + ty, 14, 14, odd ? "#8f6a4a" : "#9a7452");
    }
  }
  r(ctx, lounge.cx, lounge.cy + 104, lounge.cw, 2, "#6b4b34");

  // Rugs.
  r(ctx, lounge.cx + 26, lounge.cy + 168, 336, 20, "#3f2f3b");
  r(ctx, lounge.cx + 30, lounge.cy + 170, 328, 16, "#5b4250");
  for (let x = 36; x < 350; x += 14) r(ctx, lounge.cx + x, lounge.cy + 172, 3, 12, "#795868");
  r(ctx, lounge.cx + 566, lounge.cy + 158, 340, 30, "#1e3a32");
  r(ctx, lounge.cx + 570, lounge.cy + 160, 332, 26, "#274a3f");

  // String lights.
  r(ctx, lounge.cx + 24, lounge.cy + 18, 920, 1, "#4b566e");
  for (let i = 0; i < 15; i++) {
    const bx = lounge.cx + 40 + i * 61;
    const by = lounge.cy + 20 + (i % 2) * 4;
    r(ctx, bx, by, 2, 3, phase === "night" ? "#ffe3a3" : "#e8cf9e");
    if (phase === "night" || phase === "dusk") {
      ctx.globalAlpha = 0.13;
      r(ctx, bx - 4, by - 2, 10, 9, "#ffd884");
      ctx.globalAlpha = 1;
    }
  }

  drawLoungeWindow(ctx, lounge.cx + 934, lounge.cy + 30, 152, 62, phase, hash32("lounge-window"));

  // TV.
  r(ctx, lounge.cx + 268, lounge.cy + 22, 100, 62, "#121a27");
  r(ctx, lounge.cx + 270, lounge.cy + 24, 96, 56, "#1b2b3c");
  r(ctx, lounge.cx + 274, lounge.cy + 28, 88, 46, "#0a1620");
  // Game on the screen.
  r(ctx, lounge.cx + 276, lounge.cy + 30, 84, 42, "#0f2030");
  for (let i = 0; i < 12; i++) r(ctx, lounge.cx + 278 + i * 7, lounge.cy + 68 - (i % 4) * 4, 5, (i % 4) * 4 + 2, "#17374a");
  r(ctx, lounge.cx + 320, lounge.cy + 38, 7, 5, "#5ad4b2");
  r(ctx, lounge.cx + 314, lounge.cy + 42, 4, 2, "#5ad4b2");
  r(ctx, lounge.cx + 334, lounge.cy + 50, 2, 2, "#f2b24c");
  r(ctx, lounge.cx + 342, lounge.cy + 46, 2, 2, "#f2b24c");
  r(ctx, lounge.cx + 296, lounge.cy + 36, 10, 1, "#8f9db7");
  r(ctx, lounge.cx + 296, lounge.cy + 39, 7, 1, "#8f9db7");
  r(ctx, lounge.cx + 268, lounge.cy + 84, 100, 8, "#1a2434");
  r(ctx, lounge.cx + 272, lounge.cy + 92, 92, 14, "#503a2a");
  r(ctx, lounge.cx + 276, lounge.cy + 94, 84, 2, "#7a5a3d");
  r(ctx, lounge.cx + 290, lounge.cy + 99, 8, 2, "#c9c3b4");
  r(ctx, lounge.cx + 330, lounge.cy + 99, 8, 2, "#c9c3b4");

  // Posters and clock.
  r(ctx, lounge.cx + 560, lounge.cy + 26, 58, 46, "#1a2333");
  r(ctx, lounge.cx + 562, lounge.cy + 28, 54, 42, "#2f4058");
  drawUiText(ctx, "SHIP", lounge.cx + 589, lounge.cy + 31, { color: "#f2b24c", font: 14, align: "center" });
  drawUiText(ctx, "IT", lounge.cx + 589, lounge.cy + 44, { color: "#5ad4b2", font: 14, align: "center" });
  r(ctx, lounge.cx + 636, lounge.cy + 38, 24, 24, "#20293a");
  r(ctx, lounge.cx + 638, lounge.cy + 40, 20, 20, "#d8cfb8");
  drawClockHands(ctx, lounge.cx + 636, lounge.cy + 38, Date.now());

  // Couch and coffee table.
  drawCouch(ctx, lounge.cx + 42, lounge.cy + 172);
  r(ctx, lounge.cx + 232, lounge.cy + 152, 88, 5, WOOD_LIGHT);
  r(ctx, lounge.cx + 236, lounge.cy + 157, 80, 4, WOOD);
  r(ctx, lounge.cx + 240, lounge.cy + 161, 4, 13, WOOD_DARK);
  r(ctx, lounge.cx + 312, lounge.cy + 161, 4, 13, WOOD_DARK);
  r(ctx, lounge.cx + 252, lounge.cy + 147, 8, 5, "#d9cbb5");
  r(ctx, lounge.cx + 262, lounge.cy + 148, 6, 4, "#8fb7a5");

  // Coffee bar.
  drawCoffeeBar(ctx, lounge.cx + 398, lounge.cy + 154);

  // Ping-pong.
  drawPingPong(ctx, lounge.cx + 612, lounge.cy + 166);

  // Bookshelf, beanbag, plants, cat.
  drawBookshelf(ctx, lounge.cx + 1104, lounge.cy + 162);
  drawBeanbag(ctx, lounge.cx + 1180, lounge.cy + 184);
  drawPlant(ctx, lounge.cx + 1232, lounge.cy + 186, 1.2, 2);
  drawLoungeCat(ctx, lounge.cx + 1090, lounge.cy + 178);
  drawPlant(ctx, lounge.cx + 540, lounge.cy + 180, 0.9, 1);

  drawPlate(ctx, lounge.cx + 10, lounge.cy + 8, 240, "BREAK ROOM", "OFF THE CLOCK", accent);
  ctx.restore();
}

export function drawLoungeFX(ctx, lounge, t, phase) {
  // TV flicker.
  const flicker = 0.03 + (Math.sin(t / 260) + 1) * 0.02;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = flicker;
  r(ctx, lounge.cx + 262, lounge.cy + 18, 112, 74, "#7fe0d3");
  ctx.globalAlpha = prev;
  // TV scanline.
  const scan = (Math.floor(t / 90) % 42);
  r(ctx, lounge.cx + 274, lounge.cy + 28 + scan, 88, 1, "rgba(255,255,255,0.06)");

  // Coffee steam.
  for (let i = 0; i < 3; i++) {
    const baseX = lounge.cx + 434 + i * 6;
    const rise = (t / 30 + i * 9) % 24;
    ctx.globalAlpha = Math.max(0, 0.36 - rise / 60);
    r(ctx, baseX, lounge.cy + 100 - rise, 2, 2, "#d9e3e0");
  }
  ctx.globalAlpha = prev;

  // String light glow at night.
  if (phase === "night" || phase === "dusk") {
    ctx.globalAlpha = 0.05;
    r(ctx, lounge.cx, lounge.cy + 10, lounge.cx + 940, 40, "#ffd884");
    ctx.globalAlpha = prev;
  }
}

export function drawLoungeBall(ctx, lounge, t, active) {
  if (!active) return;
  const sweep = (Math.sin(t / 380) + 1) / 2;
  const bx = lounge.cx + 616 + sweep * 172;
  const by = lounge.cy + 112 - Math.abs(Math.sin((t / 380) * Math.PI)) * 16;
  r(ctx, bx, by, 3, 3, "#f6f3df");
  r(ctx, bx + 1, by + 1, 1, 1, "#cfcbb8");
}

export function loungeSpots(lounge) {
  const { cx, cy } = lounge;
  return [
    { x: cx + 578, y: cy + 178, pose: "pingpong", face: 1, kind: "pingpong" },
    { x: cx + 900, y: cy + 178, pose: "pingpong", face: -1, kind: "pingpong" },
    { x: cx + 92, y: cy + 170, pose: "sit", face: 1, kind: "couch" },
    { x: cx + 156, y: cy + 170, pose: "sit", face: 1, kind: "couch" },
    { x: cx + 456, y: cy + 178, pose: "coffee", face: 1, kind: "coffee" },
    { x: cx + 1004, y: cy + 178, pose: "stand", face: 1, kind: "window" },
  ];
}

export function roomSeat(room, seat) {
  if (seat < 3) {
    return { x: room.cx + [74, 198, 322][seat], y: room.cy + 230, kind: "desk", seat };
  }
  return { x: room.cx + 366, y: room.cy + 172, kind: "standing", seat };
}

export function roomDoor(room) {
  return { x: room.cx + 20, y: room.cy + 150 };
}

export function loungeDoor(lounge) {
  return { x: lounge.cx + 20, y: lounge.cy + 124 };
}
