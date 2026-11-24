/** Tiny pixel people, drawn from rectangles so every agent can look different. */

export function shade(hex, amount) {
  let h = String(hex || "#888888").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return hex;
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const shift = amount * 2.55;
  const r = clamp(((n >> 16) & 255) + shift);
  const g = clamp(((n >> 8) & 255) + shift);
  const b = clamp((n & 255) + shift);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const OUTLINE = "#191724";

export function drawShadow(ctx, x, y, scale = 1, alpha = 0.28) {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#04070d";
  const rows = [8, 14, 18, 18, 14, 8];
  rows.forEach((w, i) => {
    ctx.fillRect(Math.round(x - (w * scale) / 2), Math.round(y - 2 + i * scale), Math.round(w * scale), Math.max(1, Math.round(scale)));
  });
  ctx.globalAlpha = prev;
}

/**
 * Draw a character with its feet at (x, y).
 * pose: stand | walk | type | sit | raise | coffee | pingpong | sleep
 */
export function drawCharacter(ctx, x, y, look, opts = {}) {
  const {
    pose = "stand",
    frame = 0,
    scale = 1,
    face = 1,
    alpha = 1,
    sub = false,
    blink = false,
  } = opts;

  if (!look) return;
  const shirt = look.shirt || "#5ad4b2";
  const skin = look.skin || "#f3c8a4";
  const hair = look.hair || "#2b2230";
  const pants = look.pants || "#2b3350";
  const shirtL = shade(shirt, 22);
  const shirtD = shade(shirt, -32);
  const skinD = shade(skin, -24);
  const hairL = shade(hair, 22);
  const pantsD = shade(pants, -34);

  const moving = pose === "walk";
  const walking = moving ? frame % 4 : 0;
  const breath = pose === "type" ? Math.floor(frame / 2) % 2 : Math.floor(frame / 4) % 2;
  const bob = pose === "walk" ? (walking === 1 || walking === 3 ? 1 : 0) : pose === "raise" ? -1 : 0;

  const r = (rx, ry, rw, rh, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(rx, ry, rw, rh);
  };

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale * face, scale);

  const legLiftL = pose === "walk" ? (walking === 0 || walking === 1 ? 1 : 0) : 0;
  const legLiftR = pose === "walk" ? (walking === 2 || walking === 3 ? 1 : 0) : 0;

  if (pose === "sit") {
    // Thighs forward, shins down: reading on the couch.
    r(-10, -16, 9, 6, OUTLINE);
    r(-10, -15, 8, 4, pants);
    r(1, -16, 9, 6, OUTLINE);
    r(2, -15, 8, 4, pants);
    r(-10, -10, 5, 10, OUTLINE);
    r(-9, -9, 3, 8, pantsD);
    r(5, -10, 5, 10, OUTLINE);
    r(6, -9, 3, 8, pantsD);
    r(-10, -1, 6, 2, OUTLINE);
    r(4, -1, 6, 2, OUTLINE);
  } else {
    // Legs and shoes.
    r(-8, -18 + legLiftL, 7, 15, OUTLINE);
    r(-7, -17 + legLiftL, 5, 12, pants);
    r(1, -18 + legLiftR, 7, 15, OUTLINE);
    r(2, -17 + legLiftR, 5, 12, pants);
    r(-8, -5 + legLiftL, 7, 4, pantsD);
    r(1, -5 + legLiftR, 7, 4, pantsD);
    r(-8, -2 + legLiftL, 7, 2, OUTLINE);
    r(1, -2 + legLiftR, 7, 2, OUTLINE);
  }

  // Torso.
  r(-9, -35, 18, 20, OUTLINE);
  r(-8, -34, 16, 18, shirt);
  r(-8, -34, 16, 3, shirtL);
  r(-8, -17, 16, 2, shirtD);
  r(-8, -25, 2, 7, shirtD);
  if (sub) {
    r(-3, -29, 6, 3, "#4a3b7a");
    r(-2, -28, 4, 1, "#b7a6ff");
  }

  // Arms.
  const armY = -33 + (pose === "type" ? 0 : breath);
  if (pose === "raise") {
    r(-12, armY, 4, 13, OUTLINE);
    r(-11, armY + 1, 2, 9, shirt);
    r(-11, armY + 10, 2, 3, skin);
    r(8, -49, 5, 18, OUTLINE);
    r(9, -48, 3, 14, shirt);
    r(9, -47, 3, 2, shirtL);
    r(8, -52, 5, 5, OUTLINE);
    r(9, -51, 3, 3, skin);
  } else if (pose === "type") {
    const tap = Math.floor(frame / 2) % 2;
    r(-12, armY, 4, 10, OUTLINE);
    r(-11, armY + 1, 2, 7, shirt);
    r(-10, -25 + tap, 9, 4, OUTLINE);
    r(-9, -24 + tap, 7, 2, shirt);
    r(-4, -24 + tap, 3, 2, skin);
    r(8, armY, 4, 10, OUTLINE);
    r(9, armY + 1, 2, 7, shirt);
    r(1, -24 + (1 - tap), 9, 4, OUTLINE);
    r(2, -23 + (1 - tap), 7, 2, shirt);
    r(2, -23 + (1 - tap), 3, 2, skin);
  } else if (pose === "coffee") {
    r(-12, armY, 4, 13, OUTLINE);
    r(-11, armY + 1, 2, 9, shirt);
    r(-11, armY + 10, 2, 3, skin);
    r(8, armY, 4, 10, OUTLINE);
    r(9, armY + 1, 2, 7, shirt);
    r(3, -27, 6, 4, OUTLINE);
    r(4, -26, 4, 2, shirt);
    r(1, -29, 5, 5, OUTLINE);
    r(2, -28, 3, 3, "#e8d9ba");
    r(6, -27, 1, 2, "#e8d9ba");
  } else if (pose === "pingpong") {
    r(-12, armY, 4, 13, OUTLINE);
    r(-11, armY + 1, 2, 9, shirt);
    r(-11, armY + 10, 2, 3, skin);
    r(8, -28, 11, 4, OUTLINE);
    r(9, -27, 9, 2, shirt);
    r(17, -29, 4, 4, OUTLINE);
    r(18, -28, 2, 2, skin);
    r(19, -37, 3, 9, OUTLINE);
    r(20, -36, 1, 7, "#e8d9ba");
    r(19, -30, 3, 1, "#e8d9ba");
  } else {
    const swing = pose === "walk" ? (walking % 2 === 0 ? 1 : -1) : 0;
    r(-12 - (swing > 0 ? 1 : 0), armY, 4, 13, OUTLINE);
    r(-11 - (swing > 0 ? 1 : 0), armY + 1, 2, 9, shirt);
    r(-11 - (swing > 0 ? 1 : 0), armY + 10, 2, 3, skin);
    r(8 + (swing < 0 ? 1 : 0), armY - (swing > 0 ? 1 : 0), 4, 13, OUTLINE);
    r(9 + (swing < 0 ? 1 : 0), armY + 1 - (swing > 0 ? 1 : 0), 2, 9, shirt);
    r(9 + (swing < 0 ? 1 : 0), armY + 10 - (swing > 0 ? 1 : 0), 2, 3, skin);
  }

  // Neck + head.
  r(-2, -37, 4, 3, skinD);
  r(-8, -50, 16, 16, OUTLINE);
  r(-7, -49, 14, 14, skin);
  r(-7, -36, 14, 1, skinD);
  r(-9, -44, 2, 4, OUTLINE);
  r(-8, -43, 1, 2, skin);
  r(7, -44, 2, 4, OUTLINE);
  r(7, -43, 1, 2, skin);
  r(-6, -38, 12, 1, skinD);

  // Hair.
  const style = look.style || "short";
  if (style === "buzz") {
    r(-7, -50, 14, 2, hair);
    r(-7, -48, 14, 1, hairL);
  } else if (style === "long") {
    r(-7, -50, 14, 4, hair);
    r(-9, -49, 2, 16, hair);
    r(7, -49, 2, 16, hair);
    r(-7, -47, 3, 2, hairL);
    r(2, -47, 5, 2, hairL);
  } else if (style === "bun") {
    r(-7, -50, 14, 4, hair);
    r(-1, -56, 7, 7, OUTLINE);
    r(0, -55, 5, 5, hair);
    r(1, -54, 2, 2, hairL);
    r(-8, -47, 1, 5, hair);
    r(7, -47, 1, 5, hair);
  } else if (style === "curls") {
    r(-7, -50, 14, 4, hair);
    r(-10, -50, 4, 5, hair);
    r(6, -50, 5, 5, hair);
    r(-9, -46, 3, 3, hair);
    r(7, -46, 3, 3, hair);
    r(-6, -49, 4, 2, hairL);
    r(2, -49, 4, 2, hairL);
  } else if (style === "cap") {
    r(-8, -51, 16, 5, OUTLINE);
    r(-7, -50, 14, 4, shirtD);
    r(-9, -47, 18, 2, OUTLINE);
    r(-8, -46, 16, 1, shirt);
    r(-1, -49, 3, 2, shirtL);
  } else if (style === "ponytail") {
    r(-7, -50, 14, 4, hair);
    r(8, -47, 3, 10, hair);
    r(9, -48, 2, 2, hairL);
    r(-8, -47, 1, 5, hair);
  } else if (style === "beanie") {
    r(-8, -53, 16, 7, OUTLINE);
    r(-7, -52, 14, 6, shirtD);
    r(-7, -47, 14, 2, shirt);
    r(-1, -55, 2, 2, shirtL);
  } else {
    r(-7, -50, 14, 4, hair);
    r(-8, -47, 1, 5, hair);
    r(7, -47, 1, 5, hair);
    r(-6, -48, 4, 2, hairL);
    r(2, -48, 4, 2, hairL);
  }

  // Eyes, eyebrows, mouth.
  const eyeY = -45;
  if (blink || pose === "sleep") {
    r(-5, eyeY + 1, 3, 1, OUTLINE);
    r(2, eyeY + 1, 3, 1, OUTLINE);
  } else if (pose === "raise") {
    r(-5, eyeY, 3, 3, OUTLINE);
    r(2, eyeY, 3, 3, OUTLINE);
    r(-4, eyeY + 1, 1, 1, "#f7f3e8");
    r(3, eyeY + 1, 1, 1, "#f7f3e8");
    r(-5, -48, 3, 1, hair);
    r(2, -48, 3, 1, hair);
  } else {
    r(-5, eyeY, 3, 2, OUTLINE);
    r(2, eyeY, 3, 2, OUTLINE);
  }
  if (pose === "raise") {
    r(-1, -40, 3, 2, "#8b3f3a");
  } else if (pose === "sleep") {
    r(-1, -39, 2, 1, skinD);
  } else {
    r(-1, -40, 3, 1, shade(skin, -46));
  }

  // Accessories.
  if (look.accessory === "glasses") {
    const gl = "#c8d7dd";
    r(-6, -47, 6, 1, gl);
    r(-6, -43, 6, 1, gl);
    r(-6, -46, 1, 3, gl);
    r(-1, -46, 1, 3, gl);
    r(1, -47, 6, 1, gl);
    r(1, -43, 6, 1, gl);
    r(1, -46, 1, 3, gl);
    r(6, -46, 1, 3, gl);
    r(0, -46, 1, 1, gl);
  } else if (look.accessory === "earring") {
    r(-9, -40, 1, 2, "#f2b24c");
  }

  if (look.accessory === "headphones") {
    r(-8, -52, 16, 2, "#2a2c3d");
    r(-11, -47, 4, 7, OUTLINE);
    r(-10, -46, 2, 5, "#3a3f57");
    r(7, -47, 4, 7, OUTLINE);
    r(8, -46, 2, 5, "#3a3f57");
    r(-10, -44, 1, 1, "#5ad4b2");
    r(9, -44, 1, 1, "#5ad4b2");
  }

  ctx.restore();
}

export function drawAvatar(canvas, look) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / 30, (canvas.height - 2) / 58);
  const feet = canvas.height - 2;
  drawCharacter(ctx, canvas.width / 2, feet, look, { pose: "stand", scale, frame: 0 });
}

export function drawPortrait(canvas, look, accent = "#5ad4b2") {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = shade(accent, -78);
  ctx.fillRect(0, 0, w, h);

  const cell = 8;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      if ((x / cell + y / cell) % 2 === 0) {
        ctx.fillStyle = shade(accent, -84);
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }

  // Pixel sun behind the character.
  ctx.fillStyle = shade(accent, -52);
  ctx.fillRect(w / 2 - 24, 10, 48, 48);
  ctx.fillRect(w / 2 - 28, 16, 56, 36);
  ctx.fillStyle = shade(accent, -60);
  ctx.fillRect(w / 2 - 18, 16, 36, 36);

  const ray = shade(accent, -68);
  ctx.fillStyle = ray;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(8 + i * 2, 54 + i * 9, w - 16 - i * 4, 1);
  }

  // Floor.
  ctx.fillStyle = shade(accent, -70);
  ctx.fillRect(0, h - 18, w, 18);
  ctx.fillStyle = shade(accent, -60);
  for (let x = 0; x < w; x += 12) ctx.fillRect(x, h - 18, 6, 2);

  drawShadow(ctx, w / 2, h - 6, 1.7, 0.35);
  const scale = (h - 12) / 56;
  drawCharacter(ctx, w / 2, h - 6, look, { pose: "stand", scale, frame: 0 });

  // Scanlines.
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}
