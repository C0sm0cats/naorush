// Procedurally drawn Inetum office posters: flat vector shapes + heavy typography.
// Everything is plain Canvas 2D so it runs on an HTMLCanvasElement or an OffscreenCanvas.

/** @typedef {{id: string, title: string, shape: 'portrait'|'landscape'|'banner'}} PosterInfo */
/** @typedef {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} Ctx */
/** @typedef {{w: number, h: number, draw: (ctx: Ctx) => void}} Art */
/**
 * @typedef {object} Spec
 * @property {string} title
 * @property {'portrait'|'landscape'|'banner'} shape
 * @property {string[]} lines Title lines, drawn as large as the width allows.
 * @property {string[]} colors One colour per title line (the last one repeats).
 * @property {string} [kicker] Small spaced caps above the title.
 * @property {string} tagline French tagline; `\n` splits lines.
 * @property {string | string[]} bg Flat colour or diagonal gradient stops.
 * @property {string} ink Kicker and footer colour.
 * @property {string} accent Background decoration colour.
 * @property {string} [shadow] Flat offset shadow behind the title.
 * @property {string} tagBg
 * @property {string} tagFg
 * @property {Art} [art]
 * @property {number} [titleSize]
 * @property {'side'|'stack'} [layout] Landscape only.
 * @property {(ctx: Ctx, x: number, y: number) => number} [extra] Drawn under the title; returns the new y.
 * @property {(ctx: Ctx) => void} [custom] Replaces the whole layout.
 */

const C = {
  navy: '#141a2c',
  blue: '#27408b',
  lime: '#c6f432',
  pink: '#ff4f9a',
  sky: '#58d5ff',
  sun: '#ffd166',
  paper: '#fffaf0',
};
const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
const TAU = Math.PI * 2;
const SKIN = ['#f6d3b3', '#e0a57a', '#b97a52', '#8a5536', '#5e3a26'];
const HAIR = ['#2b1d14', '#5a3a22', '#141a2c', '#c9822e', '#3a2a20'];

const SIZES = { portrait: [768, 1024], landscape: [1024, 768], banner: [1536, 512] };

// ---------------------------------------------------------------- colour + shape helpers

/** @param {string} hex */
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Linear mix between two hex colours.
 * @param {string} a
 * @param {string} b
 * @param {number} t 0 = a, 1 = b
 */
function mix(a, b, t) {
  const x = rgb(a);
  const y = rgb(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** @param {number} size @param {number} [weight] */
function font(size, weight = 900) {
  return `${weight} ${Math.round(size)}px ${FONT}`;
}

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} r @param {string | CanvasGradient} c */
function circle(ctx, x, y, r, c) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = c;
  ctx.fill();
}

/**
 * @param {Ctx} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @param {number} w
 * @param {string} c
 * @param {number} [a0]
 * @param {number} [a1]
 */
function arc(ctx, x, y, r, w, c, a0 = 0, a1 = TAU) {
  ctx.beginPath();
  ctx.arc(x, y, r, a0, a1);
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.strokeStyle = c;
  ctx.stroke();
}

/**
 * @param {Ctx} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number | number[]} r
 * @param {string | CanvasGradient} c
 */
function box(ctx, x, y, w, h, r, c) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = c;
  ctx.fill();
}

/** @param {Ctx} ctx @param {number[]} p flat x,y list @param {string | CanvasGradient} c */
function poly(ctx, p, c) {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.closePath();
  ctx.fillStyle = c;
  ctx.fill();
}

/**
 * @param {Ctx} ctx
 * @param {number[]} p flat x,y list
 * @param {number} w
 * @param {string} c
 * @param {number[]} [dash]
 */
function path(ctx, p, w, c, dash) {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = c;
  ctx.setLineDash(dash ?? []);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Four-point sparkle. @param {Ctx} ctx @param {number} x @param {number} y @param {number} r @param {string} c */
function spark(ctx, x, y, r, c) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fillStyle = c;
  ctx.fill();
}

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} s @param {number} w @param {string} c */
function check(ctx, x, y, s, w, c) {
  path(ctx, [x - s, y, x - s * 0.3, y + s * 0.7, x + s, y - s * 0.7], w, c);
}

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} s @param {string} c */
function heart(ctx, x, y, s, c) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.95);
  ctx.bezierCurveTo(x - s * 1.5, y + s * 0.05, x - s * 0.95, y - s * 1.05, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.95, y - s * 1.05, x + s * 1.5, y + s * 0.05, x, y + s * 0.95);
  ctx.fillStyle = c;
  ctx.fill();
}

/** Lightning bolt centred on x,y, about 2s tall. @param {Ctx} ctx @param {number} x @param {number} y @param {number} s @param {string} c */
function bolt(ctx, x, y, s, c) {
  const p = [0.2, -1, -0.6, 0.12, -0.05, 0.12, -0.25, 1, 0.6, -0.2, 0.05, -0.2];
  poly(
    ctx,
    p.map((v, i) => (i % 2 ? y + v * s : x + v * s)),
    c,
  );
}

/** Map pin with the tip at x,y. @param {Ctx} ctx @param {number} x @param {number} y @param {number} r @param {string} c @param {string} hole */
function pin(ctx, x, y, r, c, hole) {
  ctx.beginPath();
  ctx.arc(x, y - 2 * r, r, Math.PI * (5 / 6), Math.PI * (1 / 6));
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = c;
  ctx.fill();
  circle(ctx, x, y - 2 * r, r * 0.42, hole);
}

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} a @param {() => void} fn */
function at(ctx, x, y, a, fn) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  fn();
  ctx.restore();
}

/**
 * @param {Ctx} ctx
 * @param {string} str
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} c
 * @param {{weight?: number, align?: CanvasTextAlign, spacing?: number, maxW?: number}} [o]
 * @returns {number} the font size actually used
 */
function text(ctx, str, x, y, size, c, o = {}) {
  const weight = o.weight ?? 900;
  const spacing = o.spacing ?? 0;
  ctx.font = font(size, weight);
  ctx.letterSpacing = `${spacing}px`;
  if (o.maxW) {
    const w = ctx.measureText(str).width;
    if (w > o.maxW) {
      size *= o.maxW / w;
      ctx.font = font(size, weight);
      ctx.letterSpacing = `${(spacing * o.maxW) / w}px`;
    }
  }
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = c;
  ctx.fillText(str, x, y);
  ctx.letterSpacing = '0px';
  return size;
}

/** @param {Ctx} ctx @param {string} str @param {number} size @param {number} [weight] */
function measure(ctx, str, size, weight = 900) {
  ctx.font = font(size, weight);
  ctx.letterSpacing = '0px';
  return ctx.measureText(str).width;
}

/** Small character. Feet at x,y; about 210·s tall. @param {Ctx} ctx @param {number} x @param {number} y @param {number} s
 * @param {{skin: string, hair: string, shirt: string, pants: string, cheer?: boolean, wave?: boolean}} o */
function person(ctx, x, y, s, o) {
  box(ctx, x - 24 * s, y - 84 * s, 20 * s, 84 * s, 9 * s, o.pants);
  box(ctx, x + 4 * s, y - 84 * s, 20 * s, 84 * s, 9 * s, o.pants);
  const sh = y - 140 * s;
  const lArm = o.cheer ? [x - 62 * s, y - 214 * s] : [x - 42 * s, y - 86 * s];
  const rArm = o.cheer || o.wave ? [x + 62 * s, y - 214 * s] : [x + 42 * s, y - 86 * s];
  path(ctx, [x - 26 * s, sh, lArm[0], lArm[1]], 18 * s, o.shirt);
  path(ctx, [x + 26 * s, sh, rArm[0], rArm[1]], 18 * s, o.shirt);
  circle(ctx, lArm[0], lArm[1], 10 * s, o.skin);
  circle(ctx, rArm[0], rArm[1], 10 * s, o.skin);
  box(ctx, x - 34 * s, y - 160 * s, 68 * s, 86 * s, 26 * s, o.shirt);
  circle(ctx, x, y - 190 * s, 30 * s, o.skin);
  ctx.beginPath();
  ctx.arc(x, y - 194 * s, 31 * s, Math.PI * 1.02, Math.PI * 1.98);
  ctx.closePath();
  ctx.fillStyle = o.hair;
  ctx.fill();
  circle(ctx, x - 10 * s, y - 188 * s, 3.2 * s, C.navy);
  circle(ctx, x + 10 * s, y - 188 * s, 3.2 * s, C.navy);
  arc(ctx, x, y - 182 * s, 9 * s, 3 * s, C.navy, 0.2 * Math.PI, 0.8 * Math.PI);
}

/** Raised hand; wrist at x,y. @param {Ctx} ctx @param {number} x @param {number} y @param {number} s @param {number} a
 * @param {string} skin @param {string} sleeve */
function hand(ctx, x, y, s, a, skin, sleeve) {
  at(ctx, x, y, a, () => {
    box(ctx, -25 * s, 0, 50 * s, 260 * s, 18 * s, sleeve);
    box(ctx, -26 * s, -2 * s, 52 * s, 16 * s, 6 * s, mix(sleeve, '#ffffff', 0.35));
    box(ctx, -26 * s, -62 * s, 52 * s, 66 * s, 20 * s, skin);
    const len = [40, 52, 50, 40];
    for (let i = 0; i < 4; i++) {
      box(ctx, -26 * s + i * 13 * s, -54 * s - len[i] * s, 12 * s, len[i] * s + 8 * s, 6 * s, skin);
    }
    at(ctx, -20 * s, -18 * s, -0.75, () => box(ctx, -7 * s, -44 * s, 14 * s, 46 * s, 7 * s, skin));
  });
}

/** Deterministic PRNG. @param {number} seed */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {string} s */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------- layout pieces

/** @param {Ctx} ctx @param {Spec} s @param {number} W @param {number} H */
function background(ctx, s, W, H) {
  if (Array.isArray(s.bg)) {
    const g = ctx.createLinearGradient(0, 0, W * 0.6, H);
    s.bg.forEach((c, i) => g.addColorStop(i / (s.bg.length - 1), c));
    ctx.fillStyle = g;
  } else ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, W, H);

  const r = rng(hash(s.title));
  const u = Math.min(W, H);
  ctx.save();
  ctx.globalAlpha = 0.13;
  circle(ctx, W - u * 0.08, u * 0.1, u * 0.36, s.accent);
  circle(ctx, u * 0.02, H - u * 0.24, u * 0.24, s.accent);
  // Background ornaments stay faint so the title and the art read from afar.
  ctx.globalAlpha = 0.22;
  // Dot grid in the top-right corner.
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 4; j++) circle(ctx, W - 36 - i * 22, 34 + j * 22, 3.2, s.accent);
  }
  ctx.globalAlpha = 0.85;
  // A small cluster of squares: a nod to the game's voxels.
  const q = u * 0.028;
  const sx = W - q * 4.2;
  const sy = H - q * 6.2;
  const cols = [s.accent, mix(s.accent, '#ffffff', 0.5), s.accent];
  for (let i = 0; i < 3; i++) {
    const dx = i === 2 ? q * 1.15 : 0;
    const dy = i * q * 1.15 - (i === 2 ? q * 1.15 : 0);
    box(ctx, sx + dx, sy + dy, q, q, q * 0.18, cols[i]);
  }
  ctx.globalAlpha = 0.36;
  // Sparkles stay in the side margins, clear of text and art.
  for (let i = 0; i < 4; i++) {
    const x = (i % 2 ? W - 26 : 26) + (r() - 0.5) * 12;
    const y = H * (0.3 + r() * 0.45);
    spark(ctx, x, y, 7 + r() * 7, s.accent);
  }
  ctx.restore();
}

/**
 * Title lines, each scaled to fit. Returns the bottom baseline.
 * @param {Ctx} ctx @param {Spec} s @param {number} x @param {number} y @param {number} maxW
 * @param {number} size @param {CanvasTextAlign} [align]
 */
function titleBlock(ctx, s, x, y, maxW, size, align = 'left') {
  for (let i = 0; i < s.lines.length; i++) {
    const str = s.lines[i];
    const w = measure(ctx, str, size);
    const fs = Math.min(size, (size * maxW) / w);
    // Accented capitals (COMITÉ, À...) rise above the cap height: give them headroom.
    y += fs * 0.84 + (i ? fs * 0.06 : 0) + (/[ÀÂÉÈÊËÎÏÔÙÛÇ]/.test(str) ? fs * 0.12 : 0);
    if (s.shadow)
      text(ctx, str, x + fs * 0.05, y + fs * 0.05, fs, s.shadow, { align, spacing: -1 });
    text(ctx, str, x, y, fs, s.colors[Math.min(i, s.colors.length - 1)], { align, spacing: -1 });
  }
  return y;
}

/**
 * Small spaced caps above the title, as heavy as the title so they survive minification.
 * @param {Ctx} ctx @param {string} str @param {number} x @param {number} y @param {number} size
 * @param {string} c @param {CanvasTextAlign} [align] @param {number} [maxW]
 */
function kicker(ctx, str, x, y, size, c, align = 'left', maxW = undefined) {
  text(ctx, str.toUpperCase(), x, y, size, c, { weight: 900, spacing: size * 0.16, align, maxW });
}

/** Height of a tagline card at a given size (an upper bound when the text has to shrink). @param {Spec} s @param {number} size */
function tagHeight(s, size) {
  return size * (1.25 * s.tagline.split('\n').length + 0.66);
}

/**
 * Rounded card with one or two tagline lines.
 * @param {Ctx} ctx @param {Spec} s @param {number} x @param {number} y top
 * @param {number} size @param {number} maxW @param {'center'|'left'} align
 * @returns {number} card height
 */
function taglineCard(ctx, s, x, y, size, maxW, align) {
  const lines = s.tagline.split('\n');
  const pad = size * 0.6;
  let fs = size;
  const widest = Math.max(...lines.map((l) => measure(ctx, l, fs, 800)));
  if (widest > maxW - pad * 2) fs *= (maxW - pad * 2) / widest;
  const tw = Math.max(...lines.map((l) => measure(ctx, l, fs, 800)));
  const lh = fs * 1.25;
  const w = tw + pad * 2;
  const h = lh * lines.length + pad * 1.1;
  const left = align === 'center' ? x - w / 2 : x;
  // A flat drop shadow lifts the card off busy backgrounds, the same on every poster.
  box(ctx, left + 6, y + 7, w, h, Math.min(28, h / 2), 'rgba(10,14,30,0.24)');
  box(ctx, left, y, w, h, Math.min(28, h / 2), s.tagBg);
  lines.forEach((l, i) => {
    text(ctx, l, left + w / 2, y + pad * 0.55 + lh * (i + 0.78), fs, s.tagFg, {
      weight: 800,
      align: 'center',
    });
  });
  return h;
}

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} size @param {string} c @param {CanvasTextAlign} [align] */
function footer(ctx, x, y, size, c, align = 'left') {
  const a = 'inetum';
  const b = '  ·  Positive digital flow';
  const wa = measure(ctx, a, size, 900);
  const wb = measure(ctx, b, size * 0.78, 500);
  let left = x;
  if (align === 'center') left = x - (wa + wb) / 2;
  if (align === 'right') left = x - wa - wb;
  text(ctx, a, left, y, size, c, { spacing: -0.5 });
  ctx.save();
  ctx.globalAlpha = 0.8;
  text(ctx, b, left + wa, y, size * 0.78, c, { weight: 500 });
  ctx.restore();
}

/** @param {Ctx} ctx @param {Art} art @param {number} x @param {number} y @param {number} w @param {number} h */
function placeArt(ctx, art, x, y, w, h) {
  const k = Math.min(w / art.w, h / art.h);
  ctx.save();
  ctx.translate(x + (w - art.w * k) / 2, y + (h - art.h * k) / 2);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.rect(0, 0, art.w, art.h);
  ctx.clip();
  art.draw(ctx);
  ctx.restore();
}

/** @param {Ctx} ctx @param {Spec} s */
function compose(ctx, s) {
  const [W, H] = SIZES[s.shape];
  background(ctx, s, W, H);
  if (s.shape === 'portrait') {
    const M = 60;
    let y = 62;
    if (s.kicker) {
      kicker(ctx, s.kicker, M + 4, y + 28, 30, s.ink, 'left', W - 2 * M);
      y += 40;
    }
    y = titleBlock(ctx, s, M, y, W - 2 * M, s.titleSize ?? 150);
    if (s.extra) y = s.extra(ctx, M, y);
    const tagTop = H - 70 - tagHeight(s, 44);
    if (s.art) placeArt(ctx, s.art, M - 10, y + 26, W - 2 * M + 20, tagTop - y - 44);
    taglineCard(ctx, s, W / 2, tagTop, 44, W - 2 * M + 24, 'center');
    footer(ctx, W / 2, H - 28, 24, s.ink, 'center');
  } else if (s.shape === 'landscape' && s.layout === 'stack') {
    const M = 64;
    let y = 48;
    if (s.kicker) {
      kicker(ctx, s.kicker, W / 2, y + 28, 30, s.ink, 'center', W - 2 * M);
      y += 38;
    }
    y = titleBlock(ctx, s, W / 2, y, W - 2 * M, s.titleSize ?? 150, 'center');
    if (s.extra) y = s.extra(ctx, W / 2, y);
    const tagTop = H - 64 - tagHeight(s, 40);
    if (s.art) placeArt(ctx, s.art, M, y + 20, W - 2 * M, tagTop - y - 34);
    taglineCard(ctx, s, W / 2, tagTop, 40, W - 2 * M, 'center');
    footer(ctx, W / 2, H - 26, 22, s.ink, 'center');
  } else if (s.shape === 'landscape') {
    const M = 64;
    const colW = 470;
    let y = 68;
    if (s.kicker) {
      kicker(ctx, s.kicker, M + 3, y + 28, 30, s.ink, 'left', colW);
      y += 40;
    }
    y = titleBlock(ctx, s, M, y, colW, s.titleSize ?? 140);
    if (s.extra) y = s.extra(ctx, M, y);
    if (s.art) placeArt(ctx, s.art, 560, 50, 420, 640);
    taglineCard(ctx, s, M, Math.max(y + 32, H - 78 - tagHeight(s, 40)), 40, colW, 'left');
    footer(ctx, M, H - 36, 22, s.ink);
  } else {
    const X = 500;
    const maxW = W - X - 70;
    if (s.art) placeArt(ctx, s.art, 40, 36, 420, H - 72);
    let y = 66;
    if (s.kicker) {
      kicker(ctx, s.kicker, X + 4, y + 32, 34, s.ink, 'left', maxW);
      y += 46;
    }
    y = titleBlock(ctx, s, X, y, maxW, s.titleSize ?? 160);
    taglineCard(ctx, s, X, y + 30, 44, maxW, 'left');
    footer(ctx, W - 70, H - 38, 26, s.ink, 'right');
  }
}

// ---------------------------------------------------------------- shading helpers

const SHADE = 'rgba(10,14,30,0.28)';

/**
 * @param {Ctx} ctx @param {number} x @param {number} y @param {number} rx @param {number} ry
 * @param {string | CanvasGradient} c @param {number} [rot]
 */
function oval(ctx, x, y, rx, ry, c, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fillStyle = c;
  ctx.fill();
}

/** Soft contact shadow. @param {Ctx} ctx @param {number} x @param {number} y @param {number} rx @param {number} ry @param {number} [a] */
function floorShadow(ctx, x, y, rx, ry, a = 0.22) {
  oval(ctx, x, y, rx, ry, `rgba(10,14,30,${a})`);
}

/**
 * Linear gradient between two points.
 * @param {Ctx} ctx @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {string[]} stops
 */
function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

/** Translucent colour. @param {string} hex @param {number} a */
function alpha(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Receipt outline with a torn bottom edge.
 * @param {Ctx} ctx @param {number} l @param {number} t @param {number} r @param {number} b @param {number} n teeth
 */
function torn(ctx, l, t, r, b, n) {
  const step = (r - l) / n;
  ctx.beginPath();
  ctx.moveTo(l, t);
  ctx.lineTo(r, t);
  ctx.lineTo(r, b);
  for (let i = 0; i < n; i++) {
    ctx.lineTo(r - (i + 0.5) * step, b + step * 0.6);
    ctx.lineTo(r - (i + 1) * step, b);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------- illustrations

/** @type {Art} */
const artLearning = {
  w: 620,
  h: 440,
  draw(ctx) {
    const base = 430;
    glow(ctx, 470, 100, 100, C.paper, 0.6);
    // Books.
    floorShadow(ctx, 100, base + 2, 104, 10);
    for (const [x, y, w, h, c] of /** @type {[number, number, number, number, string][]} */ ([
      [14, 384, 176, 46, C.pink],
      [28, 342, 150, 42, C.sky],
      [20, 304, 164, 38, C.sun],
      [42, 270, 124, 34, C.blue],
    ])) {
      box(ctx, x, y, w, h, 10, mix(c, C.navy, 0.3));
      box(ctx, x, y, w - 4, h - 5, 10, c);
      box(ctx, x + w - 26, y + 6, 16, h - 16, 4, C.paper);
      box(ctx, x + 16, y + 6, 8, h - 16, 3, mix(c, '#ffffff', 0.45));
      box(ctx, x + 30, y + 6, 8, h - 16, 3, mix(c, '#ffffff', 0.45));
    }
    // Stairs with a little depth.
    const sw = 80;
    const sh = 58;
    const x0 = 200;
    for (let i = 0; i < 5; i++) {
      const x = x0 + i * sw;
      const top = base - (i + 1) * sh;
      const front = i % 2 ? C.blue : mix(C.blue, C.navy, 0.3);
      poly(
        ctx,
        [x + sw, top, x + sw + 16, top - 12, x + sw + 16, base - 12, x + sw, base],
        mix(C.navy, C.blue, 0.2),
      );
      box(
        ctx,
        x,
        top,
        sw,
        base - top,
        0,
        grad(ctx, 0, top, 0, base, [front, mix(front, C.navy, 0.4)]),
      );
      poly(ctx, [x, top, x + sw, top, x + sw + 16, top - 12, x + 16, top - 12], C.sky);
      box(ctx, x, top, sw, 5, 0, mix(C.sky, '#ffffff', 0.5));
    }
    ['Skills', 'Career', 'Talents'].forEach((l, i) => {
      const x = x0 + (i + 2) * sw;
      const top = base - (i + 3) * sh;
      box(ctx, x + 6, top + 18, sw - 12, 28, 14, C.paper);
      text(ctx, l, x + sw / 2, top + 38, 17, C.navy, {
        weight: 850,
        align: 'center',
        maxW: sw - 22,
      });
    });
    // Jumping for the next ledge.
    floorShadow(ctx, 322, 314, 30, 6, 0.3);
    person(ctx, 322, 298, 0.56, {
      skin: SKIN[1],
      hair: HAIR[1],
      shirt: C.pink,
      pants: C.navy,
      cheer: true,
    });
    circle(ctx, 246, 168, 32, C.navy);
    circle(ctx, 246, 168, 25, C.sun);
    poly(ctx, [246, 148, 264, 168, 253, 168, 253, 186, 239, 186, 239, 168, 228, 168], C.navy);
    // Mortarboard above the top step.
    const cx = 470;
    const cy = 54;
    poly(
      ctx,
      [cx - 62, cy + 18, cx + 62, cy + 18, cx + 54, cy + 76, cx - 54, cy + 76],
      mix(C.navy, C.blue, 0.25),
    );
    oval(ctx, cx, cy + 76, 54, 11, C.navy);
    poly(ctx, [cx - 124, cy + 8, cx, cy - 38, cx + 124, cy + 8, cx, cy + 54], SHADE);
    poly(ctx, [cx - 124, cy, cx, cy - 46, cx + 124, cy, cx, cy + 46], C.navy);
    poly(
      ctx,
      [cx - 104, cy, cx, cy - 38, cx + 104, cy, cx, cy + 38],
      grad(ctx, cx - 100, cy - 40, cx + 100, cy + 40, [
        mix(C.navy, C.blue, 0.85),
        mix(C.navy, C.blue, 0.3),
      ]),
    );
    path(ctx, [cx, cy, cx - 86, cy + 12, cx - 92, cy + 76], 6, C.sun);
    circle(ctx, cx, cy, 10, C.sun);
    box(ctx, cx - 102, cy + 72, 20, 34, 6, C.sun);
    for (let i = 0; i < 4; i++)
      path(
        ctx,
        [cx - 99 + i * 5, cy + 104, cx - 99 + i * 5, cy + 116],
        3,
        mix(C.sun, GOLD_DEEP, 0.5),
      );
    spark(ctx, cx + 120, cy + 70, 16, C.paper);
    spark(ctx, cx - 112, cy - 30, 12, C.navy);
    spark(ctx, 600, 30, 14, C.paper);
  },
};

/** @type {Art} */
const artChrono = {
  w: 620,
  h: 440,
  draw(ctx) {
    const cx = 430;
    const cy = 238;
    const gold = mix(C.sun, '#e0a030', 0.5);
    glow(ctx, cx, cy, 190, C.sun, 0.3);
    // Ringing!
    for (const [s, a0, a1] of [
      [-1, Math.PI * 1.02, Math.PI * 1.38],
      [1, Math.PI * 1.52, Math.PI * 1.8],
    ]) {
      arc(ctx, cx + s * 120, cy - 150, 64, 7, C.pink, a0, a1);
      arc(ctx, cx + s * 120, cy - 150, 84, 6, alpha(C.pink, 0.55), a0 + 0.06, a1 - 0.06);
    }
    path(ctx, [cx, cy - 180, cx, cy - 212], 10, gold);
    circle(ctx, cx, cy - 216, 13, C.sun);
    for (const s of [-1, 1]) {
      const bx = cx + s * 120;
      circle(ctx, bx + 6, cy - 144, 46, SHADE);
      circle(ctx, bx, cy - 150, 46, grad(ctx, bx - 40, cy - 190, bx + 40, cy - 110, [C.sun, gold]));
      circle(ctx, bx - 14, cy - 166, 13, mix(C.sun, '#ffffff', 0.6));
      path(ctx, [cx + s * 110, cy + 150, cx + s * 142, cy + 196], 18, gold);
    }
    // Clock body.
    circle(ctx, cx + 10, cy + 12, 186, SHADE);
    circle(ctx, cx, cy, 186, grad(ctx, cx - 180, cy - 180, cx + 180, cy + 180, [C.sun, gold]));
    circle(ctx, cx, cy, 160, gold);
    circle(ctx, cx, cy, 151, C.paper);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU;
      const big = i % 5 === 0;
      const r0 = big ? 120 : 132;
      path(
        ctx,
        [
          cx + Math.cos(a) * r0,
          cy + Math.sin(a) * r0,
          cx + Math.cos(a) * 140,
          cy + Math.sin(a) * 140,
        ],
        big ? 8 : 3,
        big ? C.navy : mix(C.navy, C.paper, 0.6),
      );
    }
    ['12', '3', '6', '9'].forEach((n, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 2;
      text(ctx, n, cx + Math.cos(a) * 100, cy + Math.sin(a) * 100 + 11, 30, C.navy, {
        align: 'center',
      });
    });
    // 9:00 sharp.
    path(ctx, [cx, cy, cx - 76, cy], 16, C.navy);
    path(ctx, [cx, cy, cx, cy - 74], 11, C.navy);
    path(ctx, [cx, cy + 30, cx + 68, cy - 88], 4, C.pink);
    circle(ctx, cx, cy, 16, C.pink);
    circle(ctx, cx, cy, 6, C.paper);
    ctx.save();
    ctx.globalAlpha = 0.7;
    arc(ctx, cx, cy, 128, 10, '#ffffff', Math.PI * 1.12, Math.PI * 1.38);
    ctx.restore();
    // Badge reader, with its checkpoint flag.
    path(ctx, [62, 122, 62, 62], 6, C.paper);
    poly(ctx, [65, 62, 112, 76, 65, 92], C.lime);
    box(ctx, 34, 130, 190, 300, 30, SHADE);
    box(ctx, 26, 120, 190, 300, 30, grad(ctx, 0, 120, 0, 420, [mix(C.blue, C.sky, 0.3), C.blue]));
    box(ctx, 44, 130, 154, 8, 4, alpha('#ffffff', 0.3));
    box(ctx, 46, 152, 150, 86, 14, C.navy);
    glow(ctx, 121, 196, 74, C.lime, 0.3);
    text(ctx, '08:59', 121, 213, 44, C.lime, { align: 'center', weight: 800 });
    for (let i = 0; i < 3; i++)
      arc(ctx, 121, 336, 24 + i * 21, 7, alpha(C.sky, 1 - i * 0.25), -2.4, -0.74);
    circle(ctx, 121, 336, 10, C.sky);
    glow(ctx, 62, 394, 24, C.lime, 0.6);
    circle(ctx, 62, 394, 8, C.lime);
    circle(ctx, 90, 394, 8, mix(C.blue, C.navy, 0.45));
    // Badge on its lanyard, tapping the reader.
    at(ctx, 196, 344, 0.22, () => {
      ctx.scale(0.8, 0.8);
      path(ctx, [0, -70, -30, -150], 10, C.pink);
      path(ctx, [0, -70, 34, -150], 10, C.pink);
      box(ctx, -52, -64, 116, 156, 16, SHADE);
      box(ctx, -58, -72, 116, 156, 16, C.paper);
      box(ctx, -58, -72, 116, 34, [16, 16, 0, 0], C.pink);
      box(ctx, -14, -80, 28, 16, 6, mix(C.navy, '#ffffff', 0.3));
      circle(ctx, 0, 6, 30, mix(C.sky, C.paper, 0.5));
      circle(ctx, 0, 8, 22, SKIN[2]);
      ctx.beginPath();
      ctx.arc(0, 4, 23, Math.PI, 0);
      ctx.fillStyle = HAIR[0];
      ctx.fill();
      box(ctx, -36, 46, 72, 9, 4, C.navy);
      box(ctx, -26, 62, 52, 7, 4, mix(C.navy, C.paper, 0.6));
    });
  },
};

/** @type {Art} */
const artSupport = {
  w: 440,
  h: 600,
  draw(ctx) {
    const cx = 220;
    const cy = 200;
    glow(ctx, cx, cy, 200, '#ffffff', 0.5);
    // Shoulders.
    box(ctx, cx - 150, cy + 112, 300, 200, [110, 110, 0, 0], C.blue);
    poly(ctx, [cx - 44, cy + 116, cx + 44, cy + 116, cx, cy + 176], C.paper);
    // Face, shaded on the lower right.
    circle(ctx, cx + 8, cy + 20, 132, SHADE);
    circle(ctx, cx, cy + 10, 132, mix(C.paper, C.sky, 0.4));
    circle(ctx, cx - 12, cy, 122, C.paper);
    for (const s of [-1, 1]) {
      circle(ctx, cx + s * 44, cy - 4, 14, C.navy);
      circle(ctx, cx + s * 44 - 4, cy - 9, 4.5, '#ffffff');
      circle(ctx, cx + s * 82, cy + 40, 17, mix(C.pink, C.paper, 0.45));
    }
    arc(ctx, cx, cy + 34, 46, 12, C.navy, 0.15 * Math.PI, 0.85 * Math.PI);
    // Headset.
    arc(ctx, cx, cy + 10, 160, 30, C.navy, Math.PI * 1.03, Math.PI * 1.97);
    arc(ctx, cx, cy + 10, 166, 6, alpha('#ffffff', 0.35), Math.PI * 1.25, Math.PI * 1.55);
    for (const s of [-1, 1]) {
      const ex = cx + s * 160;
      box(ctx, ex - 32 + 5, cy - 34, 64, 116, 28, SHADE);
      box(ctx, ex - 32, cy - 40, 64, 116, 28, C.pink);
      box(ctx, ex - 20, cy - 24, 40, 84, 18, mix(C.pink, '#ffffff', 0.35));
      box(ctx, ex - 22, cy - 34, 10, 40, 5, alpha('#ffffff', 0.5));
    }
    ctx.beginPath();
    ctx.moveTo(cx - 160, cy + 70);
    ctx.quadraticCurveTo(cx - 150, cy + 150, cx - 40, cy + 140);
    ctx.lineWidth = 14;
    ctx.strokeStyle = C.navy;
    ctx.lineCap = 'round';
    ctx.stroke();
    glow(ctx, cx - 34, cy + 140, 46, C.lime, 0.5);
    box(ctx, cx - 56, cy + 124, 44, 32, 16, C.lime);
    // Speech waves.
    arc(ctx, cx + 120, cy - 150, 26, 9, C.paper, -1.2, 0.2);
    arc(ctx, cx + 120, cy - 150, 52, 9, C.paper, -1.2, 0.2);
    // Ticket.
    at(ctx, cx, 468, -0.06, () => {
      box(ctx, -182, -80, 380, 180, 24, SHADE);
      box(ctx, -190, -90, 380, 180, 24, C.navy);
      box(ctx, -190, -90, 380, 14, [24, 24, 0, 0], mix(C.navy, C.sky, 0.25));
      circle(ctx, -190, 0, 26, C.sky);
      circle(ctx, 190, 0, 26, C.sky);
      path(ctx, [72, -70, 72, 70], 4, mix(C.navy, C.sky, 0.5), [10, 10]);
      text(ctx, 'TICKET #4242', -150, -34, 28, C.sky, { weight: 800 });
      box(ctx, -150, -10, 170, 12, 6, mix(C.navy, C.paper, 0.35));
      box(ctx, -150, 16, 120, 12, 6, mix(C.navy, C.paper, 0.35));
      box(ctx, -152, 42, 150, 36, 18, C.lime);
      text(ctx, 'RÉSOLU', -77, 70, 24, C.navy, { align: 'center', weight: 900 });
      glow(ctx, 130, 0, 70, C.lime, 0.35);
      circle(ctx, 130, 0, 38, C.lime);
      check(ctx, 130, 2, 18, 9, C.navy);
    });
    // A bare cable, already reported.
    ctx.beginPath();
    ctx.moveTo(-10, 590);
    ctx.bezierCurveTo(70, 560, 120, 604, 196, 580);
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.navy;
    ctx.stroke();
    for (const a of [-0.5, -0.1, 0.3])
      path(ctx, [198, 579, 198 + Math.cos(a) * 26, 579 + Math.sin(a) * 26], 4, GOLD_DEEP);
    spark(ctx, 238, 568, 16, C.sun);
    spark(ctx, 232, 596, 8, C.paper);
  },
};

/** @type {Art} */
const artConcur = {
  w: 620,
  h: 440,
  draw(ctx) {
    // Dashed flight path up to the plane.
    ctx.beginPath();
    ctx.moveTo(300, 116);
    ctx.bezierCurveTo(340, 30, 420, 30, 452, 96);
    ctx.setLineDash([14, 14]);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = mix(C.sky, C.blue, 0.3);
    ctx.stroke();
    ctx.setLineDash([]);
    // Suitcase.
    floorShadow(ctx, 560, 432, 64, 8, 0.3);
    box(ctx, 532, 278, 56, 30, 12, C.navy);
    box(
      ctx,
      506,
      296,
      108,
      132,
      20,
      grad(ctx, 506, 0, 614, 0, [C.pink, mix(C.pink, C.navy, 0.25)]),
    );
    box(ctx, 528, 296, 10, 132, 0, mix(C.pink, C.navy, 0.3));
    box(ctx, 582, 296, 10, 132, 0, mix(C.pink, C.navy, 0.3));
    circle(ctx, 560, 340, 14, C.sun);
    box(ctx, 540, 380, 40, 22, 6, C.paper);
    // Receipt.
    at(ctx, 150, 222, -0.08, () => {
      ctx.save();
      ctx.translate(10, 12);
      torn(ctx, -120, -200, 120, 190, 8);
      ctx.fillStyle = SHADE;
      ctx.fill();
      ctx.restore();
      torn(ctx, -120, -200, 120, 190, 8);
      ctx.fillStyle = C.paper;
      ctx.fill();
      text(ctx, 'REÇU', 0, -150, 40, C.navy, { align: 'center' });
      for (let i = 0; i < 4; i++) {
        box(ctx, -90, -110 + i * 38, 100 - (i % 2) * 30, 12, 6, mix(C.navy, C.paper, 0.6));
        box(ctx, 40, -110 + i * 38, 50, 12, 6, mix(C.navy, C.paper, 0.45));
      }
      path(ctx, [-90, 58, 90, 58], 4, C.navy, [8, 8]);
      text(ctx, 'TOTAL', -90, 104, 26, C.navy, { weight: 800 });
      text(ctx, '42,00 €', 90, 146, 46, C.blue, { align: 'right' });
    });
    glow(ctx, 268, 52, 60, C.lime, 0.4);
    circle(ctx, 268, 52, 34, C.lime);
    check(ctx, 268, 54, 15, 9, C.navy);
    // Phone scanning the receipt.
    at(ctx, 410, 262, 0.1, () => {
      box(ctx, -70, -132, 156, 280, 28, SHADE);
      box(ctx, -78, -140, 156, 280, 28, C.navy);
      box(
        ctx,
        -66,
        -122,
        132,
        230,
        16,
        grad(ctx, 0, -122, 0, 108, [mix(C.sky, C.paper, 0.4), C.sky]),
      );
      box(ctx, -20, -134, 40, 8, 4, mix(C.navy, '#ffffff', 0.25));
      box(ctx, -36, -92, 72, 120, 6, C.paper);
      for (let i = 0; i < 4; i++)
        box(ctx, -24, -76 + i * 20, 48 - (i % 2) * 16, 7, 3, mix(C.navy, C.paper, 0.55));
      for (const [x, y, dx, dy] of [
        [-48, -106, 1, 1],
        [48, -106, -1, 1],
        [-48, 42, 1, -1],
        [48, 42, -1, -1],
      ])
        path(ctx, [x, y + dy * 22, x, y, x + dx * 22, y], 6, C.lime);
      glow(ctx, 0, -24, 70, C.lime, 0.35);
      box(ctx, -56, -27, 112, 6, 3, C.lime);
      box(ctx, -40, 62, 80, 30, 15, C.lime);
      text(ctx, 'OK', 0, 85, 22, C.navy, { align: 'center' });
      circle(ctx, 0, 124, 9, mix(C.navy, '#ffffff', 0.3));
    });
    // Plane.
    at(ctx, 530, 84, -0.45, () => {
      poly(ctx, [-10, -6, 30, -6, -20, -90, -44, -90], mix(C.sky, C.paper, 0.4));
      poly(ctx, [-10, 6, 30, 6, -20, 90, -44, 90], mix(C.sky, C.blue, 0.2));
      box(ctx, -90, -18, 190, 36, 18, C.paper);
      box(ctx, -80, 6, 170, 10, 5, mix(C.paper, C.sky, 0.45));
      poly(ctx, [-90, -4, -70, -4, -88, -44, -104, -44], mix(C.sky, C.blue, 0.2));
      for (let i = 0; i < 4; i++) circle(ctx, -40 + i * 26, -3, 6, C.sky);
      box(ctx, 70, -10, 20, 12, 6, C.navy);
    });
  },
};

/** @type {Art} */
const artPeopleDoc = {
  w: 620,
  h: 440,
  draw(ctx) {
    // The cloud that keeps everything warm.
    ctx.save();
    ctx.globalAlpha = 0.95;
    box(ctx, 404, 82, 180, 52, 26, '#ffffff');
    circle(ctx, 452, 84, 42, '#ffffff');
    circle(ctx, 512, 70, 52, '#ffffff');
    circle(ctx, 556, 98, 34, '#ffffff');
    ctx.restore();
    poly(ctx, [512, 40, 538, 70, 524, 70, 524, 100, 500, 100, 500, 70, 486, 70], C.sky);
    path(ctx, [420, 140, 380, 180], 5, alpha(C.blue, 0.6), [2, 12]);
    // Folder back.
    const back = mix(C.blue, C.sky, 0.35);
    box(ctx, 100, 70, 160, 60, 18, back);
    box(ctx, 108, 108, 420, 320, 24, SHADE);
    box(ctx, 100, 100, 420, 320, 24, back);
    // Payslip and a second document.
    at(ctx, 340, 210, 0.07, () => {
      box(ctx, -150, -170, 290, 300, 14, mix(C.paper, C.sky, 0.25));
      for (let i = 0; i < 3; i++)
        box(ctx, -110, -120 + i * 30, 160, 10, 5, mix(C.sky, C.paper, 0.4));
    });
    at(ctx, 300, 200, -0.05, () => {
      box(ctx, -144, -162, 300, 320, 14, SHADE);
      box(ctx, -150, -170, 300, 320, 14, C.paper);
      box(ctx, -150, -170, 300, 20, [14, 14, 0, 0], C.pink);
      text(ctx, 'BULLETIN DE PAIE', -122, -118, 24, C.blue, { weight: 900 });
      for (let i = 0; i < 4; i++) {
        box(ctx, -122, -94 + i * 28, 150 - (i % 2) * 40, 11, 5, mix(C.navy, C.paper, 0.65));
        box(ctx, 66, -94 + i * 28, 56, 11, 5, mix(C.navy, C.paper, 0.5));
      }
      // Paper clip.
      ctx.beginPath();
      ctx.roundRect(96, -194, 26, 70, 13);
      ctx.lineWidth = 6;
      ctx.strokeStyle = mix(C.navy, C.paper, 0.35);
      ctx.stroke();
    });
    // Folder front.
    poly(
      ctx,
      [80, 220, 540, 220, 520, 420, 100, 420],
      grad(ctx, 0, 220, 0, 420, [C.sky, mix(C.sky, C.blue, 0.35)]),
    );
    poly(ctx, [80, 220, 540, 220, 536, 250, 84, 250], mix(C.sky, '#ffffff', 0.4));
    box(ctx, 150, 304, 250, 66, 18, C.paper);
    text(ctx, 'DOCUMENTS RH', 275, 350, 34, C.navy, { align: 'center', maxW: 220 });
    // Shield with a padlock.
    const sx = 540;
    const sy = 330;
    /** @param {number} dx @param {number} dy @param {string | CanvasGradient} c */
    const shield = (dx, dy, c) => {
      ctx.beginPath();
      ctx.moveTo(sx + dx, sy - 80 + dy);
      ctx.quadraticCurveTo(sx + 40 + dx, sy - 60 + dy, sx + 70 + dx, sy - 64 + dy);
      ctx.quadraticCurveTo(sx + 76 + dx, sy + 40 + dy, sx + dx, sy + 86 + dy);
      ctx.quadraticCurveTo(sx - 76 + dx, sy + 40 + dy, sx - 70 + dx, sy - 64 + dy);
      ctx.quadraticCurveTo(sx - 40 + dx, sy - 60 + dy, sx + dx, sy - 80 + dy);
      ctx.fillStyle = c;
      ctx.fill();
    };
    glow(ctx, sx, sy, 78, C.lime, 0.35);
    shield(8, 8, SHADE);
    shield(
      0,
      0,
      grad(ctx, sx - 70, sy - 80, sx + 70, sy + 86, [mix(C.lime, '#ffffff', 0.3), C.lime]),
    );
    arc(ctx, sx, sy - 6, 20, 9, C.navy, Math.PI, 0);
    box(ctx, sx - 32, sy - 8, 64, 50, 10, C.navy);
    circle(ctx, sx, sy + 12, 7, C.lime);
    box(ctx, sx - 3, sy + 14, 6, 14, 3, C.lime);
    spark(ctx, 60, 160, 20, C.pink);
    spark(ctx, 590, 190, 12, C.blue);
  },
};

/** @type {Art} */
const artSwile = {
  w: 620,
  h: 440,
  draw(ctx) {
    const cx = 300;
    const cy = 214;
    // Fork and knife, with their shadows.
    for (const [dx, c] of /** @type {[number, string][]} */ ([
      [8, SHADE],
      [0, C.paper],
    ])) {
      box(ctx, 64 + dx, 60 + dx, 18, 330, 9, c);
      for (let i = 0; i < 4; i++) box(ctx, 44 + i * 16 + dx, 50 + dx, 9, 90, 5, c);
      box(ctx, 44 + dx, 120 + dx, 57, 40, 14, c);
      ctx.beginPath();
      ctx.moveTo(526 + dx, 390 + dx);
      ctx.lineTo(526 + dx, 50 + dx);
      ctx.quadraticCurveTo(570 + dx, 90 + dx, 560 + dx, 240 + dx);
      ctx.lineTo(546 + dx, 250 + dx);
      ctx.lineTo(546 + dx, 390 + dx);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
    }
    box(ctx, 530, 70, 6, 150, 3, mix(C.paper, C.sky, 0.4));
    // Plate seen from above.
    circle(ctx, cx + 10, cy + 12, 182, SHADE);
    circle(ctx, cx, cy, 182, C.paper);
    arc(ctx, cx, cy, 170, 6, '#ffffff', Math.PI * 1.1, Math.PI * 1.45);
    circle(ctx, cx, cy, 140, mix(C.paper, C.pink, 0.14));
    circle(ctx, cx + 6, cy + 6, 130, mix(C.paper, C.pink, 0.08));
    // Bowl: greens, tomatoes, cucumber, an egg.
    const r = rng(7);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      at(ctx, cx - 30 + Math.cos(a) * 60, cy + 10 + Math.sin(a) * 50, a, () => {
        const c = i % 2 ? C.lime : mix(C.lime, '#3c8c3c', 0.45);
        oval(ctx, 0, 0, 44, 22, c);
        path(ctx, [-34, 0, 34, 0], 3, mix(c, '#2e7d32', 0.4));
      });
    }
    for (const [x, y] of [
      [cx - 90, cy - 30],
      [cx - 20, cy + 70],
      [cx + 40, cy + 40],
    ]) {
      circle(ctx, x, y, 22, mix(C.lime, '#2e7d32', 0.3));
      circle(ctx, x, y, 17, mix(C.lime, '#ffffff', 0.55));
      for (let k = 0; k < 3; k++)
        circle(
          ctx,
          x + Math.cos(k * 2.1) * 7,
          y + Math.sin(k * 2.1) * 7,
          2.5,
          mix(C.lime, '#2e7d32', 0.4),
        );
    }
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU;
      const x = cx - 30 + Math.cos(a) * 64;
      const y = cy + 10 + Math.sin(a) * 56;
      circle(ctx, x + 2, y + 3, 18, mix(C.pink, C.navy, 0.3));
      circle(ctx, x, y, 18, mix(C.pink, '#ff3b3b', 0.4));
      circle(ctx, x - 5, y - 5, 5, mix(C.pink, '#ffffff', 0.6));
    }
    oval(ctx, cx + 74, cy - 34, 54, 44, SHADE, 0.3);
    oval(ctx, cx + 70, cy - 40, 54, 44, '#ffffff', 0.3);
    circle(ctx, cx + 74, cy - 38, 22, C.sun);
    circle(ctx, cx + 68, cy - 44, 6, mix(C.sun, '#ffffff', 0.6));
    // Meal tickets: every one counts.
    for (const [x, y, a] of [
      [470, 44, 0.18],
      [150, 30, -0.2],
    ]) {
      at(ctx, x, y, a, () => {
        box(ctx, -44, -22, 88, 44, 10, C.sun);
        circle(ctx, -44, 0, 9, C.pink);
        circle(ctx, 44, 0, 9, C.pink);
        text(ctx, '+1', 0, 11, 28, C.navy, { align: 'center' });
      });
    }
    // Meal card.
    at(ctx, 470, 360, -0.16, () => {
      box(ctx, -102, -62, 220, 140, 18, SHADE);
      box(
        ctx,
        -110,
        -70,
        220,
        140,
        18,
        grad(ctx, -110, -70, 110, 70, [mix(C.navy, C.blue, 0.4), C.navy]),
      );
      box(ctx, -86, -42, 50, 38, 8, C.sun);
      path(ctx, [-86, -23, -36, -23], 2, mix(C.sun, GOLD_DEEP, 0.6));
      path(ctx, [-61, -42, -61, -4], 2, mix(C.sun, GOLD_DEEP, 0.6));
      for (let i = 0; i < 3; i++) arc(ctx, -16, -23, 8 + i * 8, 3, C.paper, -0.7, 0.7);
      text(ctx, 'Bon appétit', -86, 46, 26, C.paper, { weight: 800, maxW: 150 });
      heart(ctx, 74, -24, 18, C.pink);
    });
  },
};

/** @type {Art} */
const artOrder = {
  w: 620,
  h: 440,
  draw(ctx) {
    // Clipboard.
    box(ctx, 132, 32, 380, 420, 28, SHADE);
    box(
      ctx,
      120,
      20,
      380,
      420,
      28,
      grad(ctx, 120, 20, 500, 440, [mix(C.blue, C.sky, 0.25), C.blue]),
    );
    box(ctx, 146, 56, 328, 370, 12, mix(C.paper, C.navy, 0.12));
    box(ctx, 146, 52, 328, 370, 12, '#ffffff');
    box(ctx, 230, 0, 160, 56, 16, C.navy);
    box(ctx, 240, 6, 140, 10, 5, mix(C.navy, '#ffffff', 0.3));
    box(ctx, 266, 18, 88, 18, 9, C.sun);
    text(ctx, 'N° 2026-042', 176, 106, 26, C.blue, { weight: 900 });
    box(ctx, 360, 84, 90, 30, 15, mix(C.sky, '#ffffff', 0.6));
    text(ctx, 'J+0', 405, 106, 20, C.blue, { align: 'center', weight: 850 });
    const rows = ['Projet', 'Fournisseur', 'Montant'];
    rows.forEach((l, i) => {
      const y = 132 + i * 52;
      box(ctx, 176, y, 34, 34, 8, mix(C.lime, '#ffffff', 0.2));
      check(ctx, 193, y + 18, 10, 6, C.navy);
      text(ctx, l, 224, y + 26, 24, C.navy, { weight: 800 });
      path(ctx, [390, y + 26, 446, y + 26], 4, mix(C.navy, '#ffffff', 0.7));
    });
    // Signature.
    text(ctx, 'Signature', 176, 396, 18, mix(C.navy, '#ffffff', 0.45), { weight: 700 });
    path(ctx, [270, 400, 446, 400], 3, mix(C.navy, '#ffffff', 0.7));
    ctx.beginPath();
    ctx.moveTo(280, 392);
    ctx.bezierCurveTo(300, 350, 310, 410, 330, 380);
    ctx.bezierCurveTo(345, 360, 350, 400, 372, 384);
    ctx.quadraticCurveTo(392, 372, 420, 386);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.navy;
    ctx.stroke();
    // Stamp imprint.
    at(ctx, 320, 308, -0.12, () => {
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.roundRect(-200, -48, 400, 96, 18);
      ctx.lineWidth = 9;
      ctx.strokeStyle = C.pink;
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-187, -35, 374, 70, 12);
      ctx.lineWidth = 3;
      ctx.stroke();
      text(ctx, 'APPROUVÉ', 0, 20, 56, C.pink, { align: 'center', spacing: 2, maxW: 340 });
      ctx.globalAlpha = 1;
    });
    // Rubber stamp waiting on the desk.
    floorShadow(ctx, 62, 430, 50, 8, 0.3);
    box(ctx, 18, 392, 88, 34, 8, mix(C.pink, C.navy, 0.3));
    box(ctx, 14, 420, 96, 8, 4, C.pink);
    box(ctx, 50, 350, 24, 46, 6, C.navy);
    circle(ctx, 62, 336, 28, C.pink);
    circle(ctx, 54, 328, 9, mix(C.pink, '#ffffff', 0.5));
    // Pen.
    at(ctx, 548, 180, 0.5, () => {
      box(ctx, -8, -144, 28, 220, 12, SHADE);
      box(ctx, -14, -150, 28, 220, 12, C.pink);
      box(ctx, -8, -140, 6, 196, 3, mix(C.pink, '#ffffff', 0.4));
      box(ctx, -14, -150, 28, 46, [12, 12, 0, 0], C.navy);
      box(ctx, 10, -150, 8, 70, 4, mix(C.navy, '#ffffff', 0.3));
      poly(ctx, [-14, 70, 14, 70, 0, 104], C.sun);
      poly(ctx, [-4, 92, 4, 92, 0, 104], C.navy);
    });
  },
};

/** @type {Art} */
const artMission = {
  w: 620,
  h: 440,
  draw(ctx) {
    // Folded map.
    const panels = [
      [70, 40, 250, 70, 250, 420, 70, 390],
      [250, 70, 420, 40, 420, 390, 250, 420],
      [420, 40, 590, 70, 590, 420, 420, 390],
    ];
    poly(ctx, [80, 52, 260, 82, 430, 52, 600, 82, 600, 432, 430, 402, 260, 432, 80, 402], SHADE);
    panels.forEach((p, i) =>
      poly(
        ctx,
        p,
        grad(
          ctx,
          p[0],
          0,
          p[2],
          0,
          i % 2
            ? [mix(C.paper, C.sky, 0.4), mix(C.paper, C.sky, 0.2)]
            : [C.paper, mix(C.paper, C.sun, 0.25)],
        ),
      ),
    );
    ctx.save();
    ctx.beginPath();
    panels.forEach((p) => {
      ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    });
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(60, 160);
    ctx.bezierCurveTo(200, 120, 280, 300, 600, 250);
    ctx.lineWidth = 26;
    ctx.strokeStyle = alpha(C.sky, 0.85);
    ctx.stroke();
    oval(ctx, 330, 360, 60, 26, alpha(C.sky, 0.85));
    poly(ctx, [380, 210, 440, 120, 500, 210], mix(C.blue, C.sky, 0.55));
    poly(ctx, [420, 210, 500, 90, 580, 210], mix(C.blue, C.sky, 0.3));
    poly(ctx, [500, 90, 580, 210, 500, 210], mix(C.blue, C.navy, 0.15));
    poly(ctx, [480, 120, 500, 90, 520, 120, 500, 130], '#ffffff');
    for (const [x, y, r] of [
      [150, 330, 34],
      [196, 352, 26],
      [130, 370, 22],
      [520, 340, 22],
    ]) {
      circle(ctx, x, y, r, mix(C.lime, '#2e7d32', 0.45));
      circle(ctx, x - r * 0.3, y - r * 0.3, r * 0.4, mix(C.lime, '#ffffff', 0.2));
    }
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(130, 120);
    ctx.bezierCurveTo(260, 60, 280, 260, 400, 280);
    ctx.quadraticCurveTo(480, 290, 500, 210);
    ctx.setLineDash([2, 18]);
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.navy;
    ctx.stroke();
    ctx.setLineDash([]);
    circle(ctx, 130, 120, 18, C.paper);
    circle(ctx, 130, 120, 12, C.navy);
    glow(ctx, 500, 128, 80, C.pink, 0.35);
    floorShadow(ctx, 500, 204, 22, 7, 0.3);
    pin(ctx, 500, 200, 36, C.pink, C.paper);
    // Ream of paper: refills for the reports.
    floorShadow(ctx, 540, 432, 72, 8, 0.3);
    poly(ctx, [470, 350, 600, 350, 612, 338, 482, 338], '#ffffff');
    poly(ctx, [600, 350, 612, 338, 612, 412, 600, 424], mix(C.paper, C.navy, 0.2));
    box(ctx, 470, 350, 130, 74, [0, 0, 6, 6], C.paper);
    box(ctx, 470, 368, 130, 32, 0, C.pink);
    text(ctx, 'A4 · 500', 535, 392, 22, '#ffffff', { align: 'center', maxW: 116 });
    // Suitcase in front.
    floorShadow(ctx, 78, 432, 80, 9, 0.3);
    box(ctx, 34, 260, 80, 40, 16, C.navy);
    box(ctx, 48, 274, 52, 30, 8, C.sun);
    box(ctx, 0, 290, 150, 140, 22, grad(ctx, 0, 0, 150, 0, [mix(C.blue, C.sky, 0.2), C.blue]));
    box(ctx, 26, 290, 14, 140, 0, mix(C.blue, C.navy, 0.4));
    box(ctx, 110, 290, 14, 140, 0, mix(C.blue, C.navy, 0.4));
    box(ctx, 50, 400, 30, 18, 6, C.pink);
    circle(ctx, 75, 352, 22, C.lime);
    check(ctx, 75, 354, 10, 6, C.navy);
  },
};

/** @type {Art} */
const artSuccess = {
  w: 620,
  h: 460,
  draw(ctx) {
    // Skyline, with the rooftop as the day's goal.
    ctx.save();
    ctx.fillStyle = alpha('#ffffff', 0.14);
    for (const [x, t, w] of [
      [20, 70, 92],
      [118, 210, 70],
      [400, 230, 80],
      [500, 260, 110],
    ])
      ctx.fillRect(x, t, w, 460 - t);
    ctx.fillStyle = alpha('#ffffff', 0.22);
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 3; c++) ctx.fillRect(32 + c * 26, 96 + r * 34, 14, 18);
    ctx.restore();
    path(ctx, [66, 72, 66, 18], 5, C.paper);
    poly(ctx, [69, 18, 110, 30, 69, 44], C.lime);
    spark(ctx, 120, 20, 12, C.lime);
    // Confetti.
    const r = rng(5);
    const conf = [C.lime, C.pink, C.sun, C.paper, C.sky];
    for (let i = 0; i < 22; i++) {
      at(ctx, 140 + r() * 320, 20 + r() * 170, r() * TAU, () =>
        box(ctx, -6, -3, 12, 6, 2, conf[i % 5]),
      );
    }
    // Podium.
    const steps = [
      { x: 50, h: 120, c: C.sky, n: '2' },
      { x: 220, h: 190, c: C.lime, n: '1' },
      { x: 390, h: 90, c: C.paper, n: '3' },
    ];
    for (const s of steps) {
      const top = 460 - s.h;
      poly(
        ctx,
        [s.x, top, s.x + 170, top, s.x + 182, top - 10, s.x + 12, top - 10],
        mix(s.c, '#ffffff', 0.45),
      );
      box(ctx, s.x, top, 170, s.h, 0, grad(ctx, 0, top, 0, 460, [s.c, mix(s.c, C.navy, 0.3)]));
      circle(ctx, s.x + 85, top + 54, 34, alpha('#ffffff', 0.35));
      text(ctx, s.n, s.x + 85, top + 76, 60, C.navy, { align: 'center' });
    }
    /** @param {number} x @param {number} y @param {number} s @param {string} c */
    const medal = (x, y, s, c) => {
      poly(ctx, [x - 14 * s, y - 50 * s, x, y - 6 * s, x + 14 * s, y - 50 * s], C.pink);
      circle(ctx, x, y, 14 * s, c);
      circle(ctx, x - 4 * s, y - 4 * s, 4 * s, '#ffffff');
    };
    person(ctx, 135, 340, 0.62, {
      skin: SKIN[3],
      hair: HAIR[0],
      shirt: C.pink,
      pants: C.navy,
      wave: true,
    });
    medal(135, 340 - 112 * 0.62, 0.62, '#d7dde8');
    person(ctx, 305, 270, 0.7, {
      skin: SKIN[0],
      hair: HAIR[3],
      shirt: C.sun,
      pants: C.navy,
      cheer: true,
    });
    medal(305, 270 - 112 * 0.7, 0.7, GOLD);
    person(ctx, 475, 370, 0.58, {
      skin: SKIN[2],
      hair: HAIR[1],
      shirt: C.sky,
      pants: C.navy,
      wave: true,
    });
    medal(475, 370 - 112 * 0.58, 0.58, '#d08a4a');
    // Target with an arrow.
    const tx = 520;
    const ty = 100;
    circle(ctx, tx + 7, ty + 8, 78, SHADE);
    circle(ctx, tx, ty, 78, C.paper);
    circle(ctx, tx, ty, 58, C.pink);
    circle(ctx, tx, ty, 38, C.paper);
    circle(ctx, tx, ty, 18, C.pink);
    arc(ctx, tx, ty, 70, 5, '#ffffff', Math.PI * 1.1, Math.PI * 1.4);
    path(ctx, [tx - 110, ty + 70, tx - 4, ty + 4], 10, C.navy);
    poly(ctx, [tx - 104, ty + 66, tx - 138, ty + 58, tx - 126, ty + 92], C.sun);
    poly(ctx, [tx - 86, ty + 54, tx - 118, ty + 46, tx - 106, ty + 78], mix(C.sun, GOLD_DEEP, 0.4));
    spark(ctx, tx - 14, ty - 20, 14, C.sun);
  },
};

/** @type {Art} */
const artComp = {
  w: 620,
  h: 440,
  draw(ctx) {
    const cx = 310;
    glow(ctx, cx, 170, 160, C.lime, 0.2);
    // Arguments, ready.
    box(ctx, 446, 0, 170, 84, 22, C.paper);
    poly(ctx, [462, 80, 492, 80, 440, 100], C.paper);
    for (let i = 0; i < 3; i++) {
      check(ctx, 470, 20 + i * 24, 8, 5, C.blue);
      box(ctx, 488, 16 + i * 24, 100 - i * 20, 9, 4, mix(C.navy, C.paper, 0.55));
    }
    // Base and pole.
    oval(ctx, cx, 438, 110, 10, SHADE);
    poly(
      ctx,
      [cx - 90, 436, cx + 90, 436, cx + 50, 396, cx - 50, 396],
      grad(ctx, cx - 90, 0, cx + 90, 0, [C.paper, mix(C.paper, C.sky, 0.45)]),
    );
    box(
      ctx,
      cx - 12,
      90,
      24,
      312,
      10,
      grad(ctx, cx - 12, 0, cx + 12, 0, [C.paper, mix(C.paper, C.sky, 0.5)]),
    );
    // Beam.
    box(ctx, cx - 230, 112, 460, 20, 10, SHADE);
    box(ctx, cx - 230, 106, 460, 20, 10, C.paper);
    box(ctx, cx - 230, 118, 460, 8, [0, 0, 10, 10], mix(C.paper, C.sky, 0.4));
    glow(ctx, cx, 84, 60, C.lime, 0.5);
    circle(ctx, cx, 84, 26, C.lime);
    circle(ctx, cx - 8, 76, 8, mix(C.lime, '#ffffff', 0.6));
    for (const side of [-1, 1]) {
      const px = cx + side * 200;
      path(ctx, [px, 120, px - 84, 280], 4, mix(C.paper, C.sky, 0.3), [8, 6]);
      path(ctx, [px, 120, px + 84, 280], 4, mix(C.paper, C.sky, 0.3), [8, 6]);
      circle(ctx, px, 118, 13, C.lime);
      ctx.beginPath();
      ctx.moveTo(px - 104, 280);
      ctx.lineTo(px + 104, 280);
      ctx.quadraticCurveTo(px + 90, 342, px, 342);
      ctx.quadraticCurveTo(px - 90, 342, px - 104, 280);
      ctx.fillStyle = grad(ctx, 0, 280, 0, 342, [C.lime, mix(C.lime, '#2e7d32', 0.45)]);
      ctx.fill();
      oval(ctx, px, 280, 104, 10, mix(C.lime, '#ffffff', 0.35));
    }
    // Left pan: a stack of coins.
    const coin = mix(C.sun, '#e0a030', 0.45);
    for (let i = 0; i < 5; i++) {
      const y = 262 - i * 20;
      box(ctx, cx - 262 + (i % 2) * 6, y, 120, 22, 10, coin);
      oval(ctx, cx - 202 + (i % 2) * 6, y + 4, 60, 7, C.sun);
    }
    circle(ctx, cx - 192, 148, 42, SHADE);
    circle(ctx, cx - 200, 140, 42, grad(ctx, cx - 240, 100, cx - 160, 180, [C.sun, coin]));
    arc(ctx, cx - 200, 140, 32, 5, mix(C.sun, '#a0661a', 0.45));
    text(ctx, '€', cx - 200, 156, 42, mix(C.sun, '#a0661a', 0.7), { align: 'center' });
    // Right pan: a star for the work done.
    starShape(ctx, cx + 206, 216, 70, 32, SHADE);
    starShape(ctx, cx + 200, 210, 70, 32, C.pink);
    starShape(ctx, cx + 190, 196, 22, 10, mix(C.pink, '#ffffff', 0.45));
    spark(ctx, cx + 110, 40, 16, C.lime);
    spark(ctx, cx - 120, 46, 12, C.sky);
  },
};

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} r @param {number} w @param {string} c */
function ring(ctx, x, y, r, w, c) {
  arc(ctx, x, y, r, w, c);
}

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} R @param {number} r @param {string} c */
function starShape(ctx, x, y, R, r, c) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? r : R;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fillStyle = c;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = c;
  ctx.stroke();
  ctx.fill();
}

/** @type {Art} */
const artPowerUp = {
  w: 440,
  h: 620,
  draw(ctx) {
    const cx = 220;
    const cy = 220;
    glow(ctx, cx, cy, 220, C.sun, 0.5);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const r1 = i % 2 ? 196 : 212;
      path(
        ctx,
        [
          cx + Math.cos(a) * 168,
          cy + Math.sin(a) * 168,
          cx + Math.cos(a) * r1,
          cy + Math.sin(a) * r1,
        ],
        14,
        i % 2 ? C.lime : C.sun,
      );
    }
    circle(
      ctx,
      cx,
      cy,
      150,
      grad(ctx, cx - 150, cy - 150, cx + 150, cy + 150, [C.sun, mix(C.sun, '#e0a030', 0.4)]),
    );
    circle(ctx, cx, cy, 122, mix(C.sun, '#ffffff', 0.4));
    arc(ctx, cx, cy, 136, 8, alpha('#ffffff', 0.6), Math.PI * 1.1, Math.PI * 1.4);
    bolt(ctx, cx + 8, cy + 8, 112, C.navy);
    bolt(ctx, cx, cy, 112, C.lime);
    bolt(ctx, cx - 4, cy - 6, 50, mix(C.lime, '#ffffff', 0.5));
    // Rising arrows: going up.
    for (const x of [44, 396]) {
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.globalAlpha = 1 - i * 0.3;
        path(ctx, [x - 22, 470 - i * 34, x, 448 - i * 34, x + 22, 470 - i * 34], 10, C.lime);
        ctx.restore();
      }
    }
    // Mountains with a flag.
    poly(ctx, [-30, 620, 90, 470, 220, 620], mix(C.navy, C.blue, 0.55));
    poly(ctx, [240, 620, 360, 480, 470, 620], mix(C.navy, C.blue, 0.55));
    poly(ctx, [-10, 620, 210, 390, 210, 620], mix(C.navy, C.blue, 0.3));
    poly(ctx, [210, 390, 450, 620, 210, 620], C.navy);
    poly(ctx, [210, 390, 260, 442, 236, 436, 214, 456, 190, 436, 168, 434], C.paper);
    poly(ctx, [210, 390, 260, 442, 236, 436, 214, 456, 210, 450], mix(C.paper, C.sky, 0.4));
    path(ctx, [210, 392, 210, 300], 8, C.paper);
    poly(ctx, [214, 300, 290, 318, 214, 340], C.lime);
    spark(ctx, 60, 60, 18, C.paper);
    spark(ctx, 392, 380, 12, C.paper);
  },
};

/** @type {Art} */
const artTour = {
  w: 420,
  h: 440,
  draw(ctx) {
    const cx = 210;
    const cy = 220;
    const hz = 290;
    glow(ctx, cx, cy, 208, C.lime, 0.25);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 200, 0, TAU);
    ctx.clip();
    ctx.fillStyle = grad(ctx, 0, 20, 0, hz, [C.navy, C.blue, mix(C.pink, C.sun, 0.35)]);
    ctx.fillRect(0, 0, 440, hz);
    const r = rng(3);
    for (let i = 0; i < 16; i++)
      circle(ctx, 40 + r() * 340, 40 + r() * 120, 1.5 + r() * 2, C.paper);
    glow(ctx, cx + 70, cy - 10, 120, C.sun, 0.5);
    circle(ctx, cx + 70, cy - 10, 56, C.sun);
    poly(ctx, [0, 300, 120, 196, 220, 300], mix(C.blue, C.navy, 0.45));
    poly(ctx, [120, 196, 220, 300, 140, 300], mix(C.blue, C.navy, 0.65));
    poly(ctx, [160, 300, 300, 170, 440, 300], mix(C.blue, C.navy, 0.3));
    poly(ctx, [300, 170, 440, 300, 320, 300], mix(C.blue, C.navy, 0.55));
    poly(ctx, [300, 170, 326, 194, 300, 188, 282, 196], C.paper);
    ctx.fillStyle = grad(ctx, 0, hz, 0, 440, [
      mix(C.lime, '#2e7d32', 0.35),
      mix(C.lime, '#2e7d32', 0.65),
    ]);
    ctx.fillRect(0, hz, 440, 200);
    poly(ctx, [cx - 16, hz, cx + 16, hz, cx + 150, 440, cx - 150, 440], C.navy);
    path(ctx, [cx - 14, hz + 2, cx - 140, 440], 4, alpha(C.paper, 0.7));
    path(ctx, [cx + 14, hz + 2, cx + 140, 440], 4, alpha(C.paper, 0.7));
    for (let i = 0; i < 3; i++) {
      const y0 = hz + 10 + i * i * 14 + i * 12;
      const h = 10 + i * 8;
      poly(
        ctx,
        [cx - 2 - i * 2, y0, cx + 2 + i * 2, y0, cx + 3 + i * 3, y0 + h, cx - 3 - i * 3, y0 + h],
        C.lime,
      );
    }
    // The tour van, seen from behind.
    floorShadow(ctx, cx, 418, 70, 10, 0.35);
    box(ctx, cx - 62, 400, 22, 24, 6, C.navy);
    box(ctx, cx + 40, 400, 22, 24, 6, C.navy);
    box(ctx, cx - 66, 330, 132, 82, 18, C.pink);
    box(ctx, cx - 52, 340, 104, 34, 8, mix(C.sky, C.navy, 0.35));
    box(ctx, cx - 46, 344, 40, 8, 4, alpha('#ffffff', 0.4));
    box(ctx, cx - 30, 384, 60, 16, 4, C.paper);
    circle(ctx, cx - 52, 392, 7, C.sun);
    circle(ctx, cx + 52, 392, 7, C.sun);
    ctx.restore();
    ring(ctx, cx, cy, 200, 14, C.lime);
    ring(ctx, cx, cy, 186, 3, alpha(C.paper, 0.5));
    floorShadow(ctx, cx - 54, 252, 22, 7, 0.4);
    pin(ctx, cx - 60, 250, 54, C.pink, C.pink);
    oval(ctx, cx - 82, 120, 12, 22, alpha('#ffffff', 0.35), 0.5);
    bolt(ctx, cx - 56, 146, 38, C.navy);
    bolt(ctx, cx - 60, 142, 38, C.lime);
  },
};

const FRANCE = [
  0.52, 0.0, 0.68, 0.07, 0.8, 0.12, 0.95, 0.2, 0.92, 0.4, 0.86, 0.5, 0.92, 0.6, 0.9, 0.72, 0.98,
  0.8, 0.86, 0.88, 0.74, 0.9, 0.62, 0.86, 0.56, 0.98, 0.42, 0.97, 0.3, 0.93, 0.21, 0.88, 0.26, 0.74,
  0.25, 0.62, 0.21, 0.52, 0.17, 0.45, 0.06, 0.38, 0.0, 0.32, 0.06, 0.27, 0.2, 0.26, 0.26, 0.18, 0.3,
  0.2, 0.38, 0.14, 0.46, 0.08,
];
const CITIES = /** @type {[number, number][]} */ ([
  [0.2, 0.42], // Nantes
  [0.5, 0.24], // Paris
  [0.56, 0.04], // Lille
  [0.86, 0.24], // Strasbourg
  [0.76, 0.58], // Lyon
  [0.8, 0.84], // Marseille
  [0.48, 0.84], // Toulouse
  [0.3, 0.66], // Bordeaux
  [0.24, 0.32], // Rennes
]);

/** @type {Art} */
const artConnect = {
  w: 620,
  h: 460,
  draw(ctx) {
    const ox = 140;
    const oy = 10;
    const sw = 420;
    const sh = 440;
    poly(
      ctx,
      FRANCE.map((v, i) => (i % 2 ? oy + 12 + v * sh : ox + 12 + v * sw)),
      mix(C.blue, C.navy, 0.2),
    );
    poly(
      ctx,
      FRANCE.map((v, i) => (i % 2 ? oy + v * sh : ox + v * sw)),
      grad(ctx, ox, oy, ox + sw, oy + sh, [mix(C.sky, '#ffffff', 0.35), C.sky]),
    );
    oval(ctx, ox + 1.0 * sw, oy + 0.92 * sh, 14, 26, C.sky, 0.2);
    const pts = CITIES.map(([x, y]) => [ox + x * sw, oy + y * sh]);
    const links = [
      [0, 1],
      [0, 8],
      [0, 7],
      [1, 2],
      [1, 3],
      [1, 4],
      [4, 5],
      [4, 3],
      [6, 7],
      [6, 5],
      [1, 8],
      [0, 6],
      [1, 6],
    ];
    for (const [a, b] of links) path(ctx, [...pts[a], ...pts[b]], 5, C.navy, [2, 12]);
    const [nx, ny] = pts[0];
    glow(ctx, nx, ny, 70, C.pink, 0.45);
    ring(ctx, nx, ny, 40, 4, alpha(C.pink, 0.6));
    pts.forEach(([x, y], i) => {
      circle(ctx, x, y, i === 0 ? 26 : 15, C.paper);
      circle(ctx, x, y, i === 0 ? 17 : 9, i === 0 ? C.pink : C.blue);
    });
    // Speech bubbles from colleagues.
    /** @param {number} x @param {number} y @param {string} t @param {string} bg @param {string} fg @param {number} dir @param {number} k */
    const chat = (x, y, t, bg, fg, dir, k) => {
      const w = measure(ctx, t, 34, 900) + 104;
      box(ctx, x + 6, y + 8, w, 78, 39, SHADE);
      box(ctx, x, y, w, 78, 39, bg);
      poly(
        ctx,
        [x + w / 2 - 14, y + 74, x + w / 2 + 14, y + 74, x + w / 2 + dir * 30, y + 106],
        bg,
      );
      avatar(ctx, x + 40, y + 39, 27, SKIN[k], HAIR[k], [C.sun, C.pink, C.lime][k % 3]);
      text(ctx, t, x + 78, y + 51, 34, fg);
    };
    chat(0, 150, 'Salut !', C.pink, '#ffffff', 1, 1);
    chat(396, 336, 'Hello !', C.blue, '#ffffff', -1, 3);
    chat(14, 352, 'On s’aide ?', C.sun, C.navy, 1, 0);
  },
};

/** @type {Art} */
const artGenAi = {
  w: 620,
  h: 440,
  draw(ctx) {
    const cx = 230;
    const cy = 262;
    glow(ctx, cx, cy, 260, C.sky, 0.35);
    // Antenna.
    path(ctx, [cx, cy - 150, cx, cy - 206], 10, C.paper);
    glow(ctx, cx, cy - 214, 56, C.pink, 0.6);
    circle(ctx, cx, cy - 214, 26, mix(C.pink, C.navy, 0.5));
    circle(ctx, cx, cy - 214, 18, C.pink);
    circle(ctx, cx - 6, cy - 220, 5, '#ffffff');
    // Ears and head.
    for (const s of [-1, 1]) {
      box(ctx, cx + s * 176 - 20, cy - 50, 40, 100, 18, C.pink);
      glow(ctx, cx + s * 190, cy, 30, C.sky, 0.6);
      circle(ctx, cx + s * 190, cy, 9, C.sky);
    }
    box(ctx, cx - 160, cy - 140, 340, 280, 60, SHADE);
    box(
      ctx,
      cx - 170,
      cy - 150,
      340,
      280,
      60,
      grad(ctx, 0, cy - 150, 0, cy + 130, ['#ffffff', mix(C.paper, C.sky, 0.35)]),
    );
    box(
      ctx,
      cx - 136,
      cy - 112,
      272,
      190,
      40,
      grad(ctx, 0, cy - 112, 0, cy + 78, [mix(C.navy, C.blue, 0.4), C.navy]),
    );
    poly(
      ctx,
      [
        cx - 110,
        cy - 112,
        cx - 50,
        cy - 112,
        cx - 120,
        cy + 20,
        cx - 136,
        cy - 10,
        cx - 136,
        cy - 80,
      ],
      alpha('#ffffff', 0.08),
    );
    for (const s of [-1, 1]) {
      glow(ctx, cx + s * 58, cy - 16, 44, C.sky, 0.45);
      arc(ctx, cx + s * 58, cy - 10, 26, 13, C.sky, Math.PI * 1.1, Math.PI * 1.9);
      circle(ctx, cx + s * 100, cy + 30, 12, mix(C.pink, C.navy, 0.45));
    }
    arc(ctx, cx, cy + 14, 30, 11, C.pink, 0.2 * Math.PI, 0.8 * Math.PI);
    box(ctx, cx - 80, cy + 130, 160, 40, [0, 0, 20, 20], mix(C.paper, C.sky, 0.45));
    // Speech bubble.
    box(ctx, 426, 30, 190, 92, 32, SHADE);
    box(ctx, 420, 22, 190, 92, 32, C.sky);
    poly(ctx, [440, 104, 480, 104, 418, 154], C.sky);
    text(ctx, 'Bonjour !', 515, 82, 36, C.navy, { align: 'center', maxW: 160 });
    // A report in flight breaks a KPI slide.
    at(ctx, 452, 214, -0.3, () => {
      for (let i = 0; i < 3; i++)
        path(
          ctx,
          [-40 - i * 4, -10 + i * 12, -70 - i * 10, -10 + i * 12],
          4,
          alpha(C.paper, 0.6 - i * 0.15),
        );
      box(ctx, -22, -28, 44, 56, 6, C.paper);
      for (let i = 0; i < 3; i++) box(ctx, -14, -16 + i * 12, 28 - i * 6, 5, 2, C.blue);
    });
    glow(ctx, 520, 268, 70, C.sun, 0.6);
    spark(ctx, 520, 268, 30, C.sun);
    /** @param {number} x @param {number} y @param {number} a @param {number[]} p @param {number[][]} bars */
    const shard = (x, y, a, p, bars) =>
      at(ctx, x, y, a, () => {
        poly(ctx, p, C.paper);
        box(ctx, p[0], p[1], 54, 12, 0, C.pink);
        for (const [bx, bh] of bars) box(ctx, bx, 40 - bh, 12, bh, 2, C.blue);
      });
    shard(
      500,
      330,
      -0.25,
      [-60, -48, 6, -48, -6, -6, 8, 18, -4, 48, -60, 48],
      [
        [-50, 30],
        [-32, 52],
      ],
    );
    shard(
      578,
      340,
      0.28,
      [-6, -48, 40, -48, 40, 48, -12, 48, 2, 18, -14, -6],
      [
        [4, 66],
        [22, 44],
      ],
    );
    box(ctx, 540, 400, 10, 10, 2, C.paper);
    box(ctx, 512, 404, 8, 8, 2, C.pink);
    spark(ctx, 40, 66, 22, C.sky);
    spark(ctx, 600, 200, 14, C.pink);
  },
};

/** @type {Art} */
const artCharity = {
  w: 620,
  h: 460,
  draw(ctx) {
    const cx = 310;
    const cy = 170;
    glow(ctx, cx, cy, 165, '#ffffff', 0.6);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      path(
        ctx,
        [
          cx + Math.cos(a) * 172,
          cy + Math.sin(a) * 162,
          cx + Math.cos(a) * 205,
          cy + Math.sin(a) * 195,
        ],
        12,
        i % 2 ? C.sun : mix(C.pink, '#ffffff', 0.3),
      );
    }
    heart(ctx, cx + 10, cy + 12, 150, mix(C.pink, C.navy, 0.35));
    heart(ctx, cx, cy, 150, C.pink);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, 0, 300, 460);
    ctx.clip();
    heart(ctx, cx, cy, 150, mix(C.pink, '#d9306f', 0.45));
    ctx.restore();
    oval(ctx, cx - 80, cy - 50, 28, 16, mix(C.pink, '#ffffff', 0.6), -0.7);
    circle(ctx, cx - 42, cy - 82, 7, mix(C.pink, '#ffffff', 0.6));
    heart(ctx, 70, 110, 22, mix(C.pink, '#ffffff', 0.3));
    heart(ctx, 560, 70, 16, C.pink);
    heart(ctx, 540, 190, 12, mix(C.pink, '#ffffff', 0.4));
    spark(ctx, 90, 30, 16, C.sun);
    const sleeves = [C.blue, C.sun, C.sky, C.lime, C.blue];
    const xs = [70, 190, 310, 430, 550];
    const ys = [400, 360, 340, 360, 400];
    const as = [-0.3, -0.12, 0, 0.12, 0.3];
    xs.forEach((x, i) => hand(ctx, x, ys[i], 1.05, as[i], SKIN[i], sleeves[i]));
  },
};

/** @type {Art} */
const artCoopt = {
  w: 880,
  h: 300,
  draw(ctx) {
    // Talent card.
    box(ctx, 130, 32, 230, 230, 40, SHADE);
    box(ctx, 120, 20, 230, 230, 40, grad(ctx, 0, 20, 0, 250, [mix(C.sky, '#ffffff', 0.3), C.sky]));
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(120, 20, 230, 230, 40);
    ctx.clip();
    circle(ctx, 235, 300, 110, C.blue);
    poly(ctx, [205, 192, 265, 192, 235, 236], C.paper);
    ctx.restore();
    circle(ctx, 235, 120, 50, SKIN[1]);
    ctx.beginPath();
    ctx.arc(235, 112, 52, Math.PI * 1.02, Math.PI * 1.98);
    ctx.fillStyle = HAIR[1];
    ctx.fill();
    circle(ctx, 218, 126, 5, C.navy);
    circle(ctx, 252, 126, 5, C.navy);
    arc(ctx, 235, 136, 14, 4, C.navy, 0.2 * Math.PI, 0.8 * Math.PI);
    glow(ctx, 330, 34, 60, C.sun, 0.5);
    starShape(ctx, 330, 34, 36, 16, C.sun);
    text(ctx, '1 TALENT', 235, 298, 46, C.paper, { align: 'center' });
    // Equals.
    for (const y of [100, 150]) {
      box(ctx, 404, y + 6, 90, 24, 12, SHADE);
      box(ctx, 400, y, 90, 24, 12, C.sun);
    }
    // Gift, bursting with joy.
    glow(ctx, 650, 150, 140, C.sun, 0.3);
    const r = rng(9);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.1 + (i / 8) * 0.8);
      path(
        ctx,
        [
          650 + Math.cos(a) * 110,
          60 + Math.sin(a) * 50,
          650 + Math.cos(a) * 140,
          60 + Math.sin(a) * 64,
        ],
        6,
        i % 2 ? C.sun : C.paper,
      );
      box(ctx, 560 + r() * 200, 4 + r() * 30, 8, 8, 2, [C.lime, C.sky, C.sun][i % 3]);
    }
    box(ctx, 550, 110, 220, 150, 18, SHADE);
    box(
      ctx,
      540,
      100,
      220,
      150,
      18,
      grad(ctx, 540, 0, 760, 0, [C.pink, mix(C.pink, C.navy, 0.25)]),
    );
    box(ctx, 524, 70, 252, 50, 14, mix(C.pink, '#ffffff', 0.25));
    box(ctx, 524, 108, 252, 12, 0, mix(C.pink, C.navy, 0.2));
    box(ctx, 634, 70, 32, 180, 0, C.sun);
    box(ctx, 640, 70, 8, 180, 0, mix(C.sun, '#ffffff', 0.45));
    ctx.lineWidth = 18;
    ctx.strokeStyle = C.sun;
    ctx.beginPath();
    ctx.ellipse(615, 50, 36, 22, 0.4, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(685, 50, 36, 22, -0.4, 0, TAU);
    ctx.stroke();
    circle(ctx, 650, 66, 16, mix(C.sun, GOLD_DEEP, 0.3));
    text(ctx, '1 PRIME', 650, 298, 46, C.paper, { align: 'center' });
    spark(ctx, 820, 70, 22, C.sun);
    spark(ctx, 60, 200, 18, C.pink);
    spark(ctx, 70, 60, 12, C.sun);
  },
};

/** @type {Art} */
const artVip = {
  w: 420,
  h: 440,
  draw(ctx) {
    const cx = 210;
    glow(ctx, cx, 150, 145, C.sun, 0.4);
    // Red carpet.
    poly(ctx, [130, 330, 290, 330, 380, 440, 40, 440], mix(C.pink, C.navy, 0.45));
    path(ctx, [130, 330, 40, 440], 4, alpha(C.sun, 0.7));
    path(ctx, [290, 330, 380, 440], 4, alpha(C.sun, 0.7));
    // Crown.
    const gold = mix(C.sun, '#e0a030', 0.45);
    const tips = [70, 200, 60, 60, 140, 130, 210, 30, 280, 130, 360, 60, 350, 200];
    poly(
      ctx,
      tips.map((v, i) => v + (i % 2 ? 10 : 8)),
      SHADE,
    );
    poly(ctx, tips, grad(ctx, 0, 30, 0, 200, [mix(C.sun, '#ffffff', 0.3), C.sun]));
    poly(ctx, [140, 130, 210, 30, 210, 200, 150, 200], alpha('#ffffff', 0.18));
    poly(ctx, [280, 130, 360, 60, 350, 200, 290, 200], alpha(gold, 0.5));
    box(ctx, 74, 198, 288, 44, 12, SHADE);
    box(ctx, 66, 190, 288, 44, 12, grad(ctx, 0, 190, 0, 234, [gold, mix(gold, GOLD_DEEP, 0.5)]));
    box(ctx, 80, 196, 260, 6, 3, alpha('#ffffff', 0.35));
    for (const [x, y, r] of [
      [60, 60, 18],
      [210, 30, 20],
      [360, 60, 18],
    ]) {
      circle(ctx, x, y, r, C.sun);
      circle(ctx, x - r * 0.3, y - r * 0.3, r * 0.35, '#ffffff');
    }
    poly(ctx, [cx, 196, cx + 18, 212, cx, 228, cx - 18, 212], C.pink);
    poly(ctx, [cx, 196, cx + 18, 212, cx, 212], mix(C.pink, '#ffffff', 0.5));
    for (const s of [-1, 1]) {
      circle(ctx, cx + s * 90, 212, 11, C.sky);
      circle(ctx, cx + s * 90 - 3, 209, 4, '#ffffff');
      circle(ctx, cx + s * 45, 212, 5, mix(C.paper, gold, 0.3));
    }
    circle(ctx, cx, 140, 16, C.pink);
    circle(ctx, cx - 5, 135, 5, '#ffffff');
    // Stanchions and velvet rope.
    for (const x of [50, 370]) {
      floorShadow(ctx, x, 428, 50, 12, 0.35);
      oval(ctx, x, 424, 46, 14, gold);
      oval(ctx, x, 420, 40, 10, C.sun);
      box(
        ctx,
        x - 9,
        300,
        18,
        120,
        6,
        grad(ctx, x - 9, 0, x + 9, 0, [mix(C.sun, '#ffffff', 0.4), gold]),
      );
      circle(ctx, x, 296, 18, C.sun);
      circle(ctx, x - 5, 290, 6, '#ffffff');
    }
    ctx.beginPath();
    ctx.moveTo(50, 316);
    ctx.quadraticCurveTo(210, 420, 370, 316);
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.strokeStyle = mix(C.pink, C.navy, 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(50, 312);
    ctx.quadraticCurveTo(210, 412, 370, 312);
    ctx.lineWidth = 14;
    ctx.strokeStyle = C.pink;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(70, 314);
    ctx.quadraticCurveTo(210, 400, 350, 314);
    ctx.lineWidth = 3;
    ctx.strokeStyle = alpha('#ffffff', 0.45);
    ctx.stroke();
    spark(ctx, 384, 250, 18, C.paper);
    spark(ctx, 30, 160, 14, C.paper);
    spark(ctx, 380, 150, 10, C.sun);
  },
};

/** @type {Art} */
const artSummer = {
  w: 620,
  h: 460,
  draw(ctx) {
    const hz = 300;
    // Sun over the sea.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 620, hz);
    ctx.clip();
    glow(ctx, 300, hz, 260, C.sun, 0.55);
    circle(ctx, 300, hz, 150, grad(ctx, 0, hz - 150, 0, hz, [C.sun, mix(C.sun, C.pink, 0.55)]));
    ctx.restore();
    for (let i = 0; i < 4; i++)
      box(ctx, 150, hz - 72 + i * 18, 300, 5 + i * 2, 0, mix(C.pink, C.sun, 0.3));
    // Gulls.
    for (const [x, y, s] of [
      [470, 150, 1],
      [520, 180, 0.7],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x - 18 * s, y);
      ctx.quadraticCurveTo(x - 8 * s, y - 12 * s, x, y);
      ctx.quadraticCurveTo(x + 8 * s, y - 12 * s, x + 18 * s, y);
      ctx.lineWidth = 4;
      ctx.strokeStyle = C.navy;
      ctx.stroke();
    }
    box(ctx, 0, hz, 620, 90, 0, grad(ctx, 0, hz, 0, hz + 90, [mix(C.blue, C.sky, 0.3), C.blue]));
    for (let i = 0; i < 4; i++)
      box(ctx, 210 + (i % 2) * 30, hz + 10 + i * 18, 180 - i * 30, 7, 4, alpha(C.sun, 0.9));
    path(ctx, [30, hz + 34, 100, hz + 34], 5, C.sky);
    path(ctx, [480, hz + 60, 580, hz + 60], 5, C.sky);
    // Sand.
    ctx.beginPath();
    ctx.moveTo(0, hz + 84);
    ctx.quadraticCurveTo(310, hz + 66, 620, hz + 88);
    ctx.lineTo(620, 460);
    ctx.lineTo(0, 460);
    ctx.closePath();
    ctx.fillStyle = grad(ctx, 0, hz + 70, 0, 460, [
      mix(C.sun, C.paper, 0.45),
      mix(C.sun, C.pink, 0.2),
    ]);
    ctx.fill();
    // String lights.
    const bulbs = [C.sun, C.sky, C.lime, C.paper];
    ctx.beginPath();
    ctx.moveTo(-20, 20);
    ctx.quadraticCurveTo(310, 140, 640, 20);
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.navy;
    ctx.stroke();
    for (let i = 1; i < 12; i++) {
      const t = i / 12;
      const x = (1 - t) * (1 - t) * -20 + 2 * (1 - t) * t * 310 + t * t * 640;
      const y = (1 - t) * (1 - t) * 20 + 2 * (1 - t) * t * 140 + t * t * 20;
      glow(ctx, x, y + 20, 30, bulbs[i % 4], 0.6);
      box(ctx, x - 5, y, 10, 10, 2, C.navy);
      circle(ctx, x, y + 20, 12, bulbs[i % 4]);
      circle(ctx, x - 4, y + 16, 3.5, '#ffffff');
    }
    // Palm tree.
    ctx.beginPath();
    ctx.moveTo(70, 460);
    ctx.quadraticCurveTo(60, 300, 130, 170);
    ctx.lineWidth = 26;
    ctx.strokeStyle = C.navy;
    ctx.lineCap = 'round';
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const t = 0.15 + i * 0.14;
      const x = (1 - t) * (1 - t) * 70 + 2 * (1 - t) * t * 60 + t * t * 130;
      const y = (1 - t) * (1 - t) * 460 + 2 * (1 - t) * t * 300 + t * t * 170;
      path(ctx, [x - 10, y, x + 10, y - 4], 3, mix(C.navy, C.blue, 0.4));
    }
    for (const [a, c] of /** @type {[number, string][]} */ ([
      [-2.7, mix(C.navy, '#2e7d32', 0.3)],
      [-2.1, C.navy],
      [-1.4, mix(C.navy, '#2e7d32', 0.3)],
      [-0.7, C.navy],
      [-0.1, mix(C.navy, '#2e7d32', 0.3)],
    ])) {
      at(ctx, 130, 170, a, () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(70, -40, 140, 20);
        ctx.quadraticCurveTo(70, 0, 0, 0);
        ctx.fillStyle = c;
        ctx.fill();
      });
    }
    circle(ctx, 122, 184, 11, mix(C.sun, '#8a5536', 0.6));
    circle(ctx, 140, 186, 10, mix(C.sun, '#8a5536', 0.7));
    // The buffet, under its cloche until the end of negotiations.
    floorShadow(ctx, 470, 456, 150, 8, 0.25);
    box(ctx, 350, 420, 10, 36, 3, C.navy);
    box(ctx, 580, 420, 10, 36, 3, C.navy);
    box(ctx, 330, 392, 280, 34, 6, C.paper);
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(350 + i * 40, 426, 20, 0, Math.PI);
      ctx.fillStyle = i % 2 ? C.pink : C.paper;
      ctx.fill();
    }
    box(ctx, 330, 392, 280, 8, 4, alpha(C.navy, 0.12));
    oval(ctx, 392, 392, 50, 8, mix(C.paper, C.sky, 0.4));
    ctx.beginPath();
    ctx.arc(392, 390, 40, Math.PI, 0);
    ctx.fillStyle = grad(ctx, 352, 0, 432, 0, ['#ffffff', mix(C.paper, C.sky, 0.55)]);
    ctx.fill();
    circle(ctx, 392, 346, 7, C.navy);
    arc(ctx, 392, 390, 30, 5, alpha('#ffffff', 0.9), Math.PI * 1.15, Math.PI * 1.4);
    oval(ctx, 480, 390, 46, 8, '#ffffff');
    for (const [x, y, c] of /** @type {[number, number, string][]} */ ([
      [462, 380, C.pink],
      [480, 376, C.lime],
      [498, 380, C.sun],
      [470, 370, C.sun],
      [490, 368, C.pink],
    ]))
      circle(ctx, x, y, 9, c);
    // Cocktail with its umbrella.
    poly(ctx, [520, 300, 600, 300, 560, 352], mix(C.sky, '#ffffff', 0.4));
    poly(ctx, [530, 310, 590, 310, 560, 346], C.pink);
    box(ctx, 557, 350, 6, 38, 3, C.paper);
    oval(ctx, 560, 390, 22, 5, C.paper);
    path(ctx, [578, 310, 588, 268], 4, C.navy);
    ctx.beginPath();
    ctx.arc(588, 268, 28, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
    ctx.fillStyle = C.lime;
    ctx.fill();
    circle(ctx, 532, 302, 12, C.lime);
  },
};

/**
 * Point on a cubic Bézier curve.
 * @param {number[]} p flat list of 4 control points
 * @param {number} t
 * @returns {[number, number]}
 */
function bezierAt(p, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]];
}

/** @param {Ctx} ctx @param {number[]} p flat list of 4 control points */
function bezierPath(ctx, p) {
  ctx.moveTo(p[0], p[1]);
  ctx.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
}

/** Soft radial glow. @param {Ctx} ctx @param {number} x @param {number} y @param {number} r @param {string} c @param {number} a */
function glow(ctx, x, y, r, c, a) {
  const [cr, cg, cb] = rgb(c);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
  g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
}

/**
 * Speech bubble with a tail.
 * @param {Ctx} ctx @param {number} x @param {number} y @param {string} t
 * @param {number} size @param {string} bg @param {string} fg @param {number} dir tail direction (-1..1)
 */
function bubble(ctx, x, y, t, size, bg, fg, dir) {
  const h = size * 1.95;
  const w = measure(ctx, t, size, 900) + size * 1.2;
  box(ctx, x, y, w, h, h / 2, bg);
  const tx = x + w / 2 + dir * w * 0.22;
  poly(ctx, [tx - 14, y + h - 4, tx + 14, y + h - 4, tx + dir * 34, y + h + size * 0.8], bg);
  text(ctx, t, x + w / 2, y + h * 0.69, size, fg, { align: 'center' });
}

/** @type {Art} */
const artHub = {
  w: 620,
  h: 440,
  draw(ctx) {
    const cx = 310;
    const cy = 220;
    glow(ctx, cx, cy, 300, C.sky, 0.45);
    // Tiles orbiting the hub.
    const cols = [C.pink, C.sun, C.lime, C.sky, C.paper, mix(C.pink, C.sun, 0.5)];
    const pts = cols.map((_, i) => {
      const a = -Math.PI / 2 + (i * TAU) / 6;
      return [cx + Math.cos(a) * 240, cy + Math.sin(a) * 162];
    });
    ctx.save();
    ctx.globalAlpha = 0.6;
    ring(ctx, cx, cy, 128, 4, C.sky);
    ctx.restore();
    for (const [x, y] of pts) path(ctx, [cx, cy, x, y], 6, mix(C.sky, C.paper, 0.3), [4, 14]);
    /** @type {((x: number, y: number) => void)[]} */
    const icons = [
      (x, y) => {
        // Document.
        box(ctx, x - 22, y - 28, 44, 56, 6, C.navy);
        for (let i = 0; i < 3; i++) box(ctx, x - 13, y - 14 + i * 12, 26 - i * 6, 5, 2, C.paper);
      },
      (x, y) => {
        // Calendar.
        box(ctx, x - 26, y - 22, 52, 48, 8, C.navy);
        box(ctx, x - 26, y - 22, 52, 14, [8, 8, 0, 0], C.pink);
        for (let i = 0; i < 6; i++)
          circle(ctx, x - 14 + (i % 3) * 14, y + 4 + (i > 2 ? 12 : 0), 4, C.paper);
      },
      (x, y) => {
        // People.
        circle(ctx, x - 13, y - 12, 11, C.navy);
        circle(ctx, x + 14, y - 8, 10, C.navy);
        box(ctx, x - 30, y + 2, 34, 26, [16, 16, 4, 4], C.navy);
        box(ctx, x - 1, y + 6, 31, 22, [14, 14, 4, 4], C.navy);
      },
      (x, y) => {
        // Chat.
        box(ctx, x - 28, y - 22, 56, 38, 14, C.navy);
        poly(ctx, [x - 14, y + 12, x - 2, y + 12, x - 18, y + 28], C.navy);
        for (let i = 0; i < 3; i++) circle(ctx, x - 14 + i * 14, y - 3, 4.5, C.paper);
      },
      (x, y) => {
        // Search.
        ring(ctx, x - 5, y - 5, 17, 8, C.navy);
        path(ctx, [x + 8, y + 8, x + 24, y + 24], 10, C.navy);
      },
      (x, y) => starShape(ctx, x, y + 2, 26, 12, C.navy),
    ];
    pts.forEach(([x, y], i) => {
      box(ctx, x - 50 + 6, y - 50 + 8, 100, 100, 26, mix(C.navy, C.blue, 0.2));
      box(ctx, x - 50, y - 50, 100, 100, 26, cols[i]);
      box(ctx, x - 40, y - 44, 80, 10, 5, mix(cols[i], '#ffffff', 0.45));
      icons[i](x, y + 4);
    });
    // The hub itself.
    circle(ctx, cx + 6, cy + 8, 92, mix(C.navy, C.blue, 0.3));
    circle(ctx, cx, cy, 92, C.paper);
    ring(ctx, cx, cy, 76, 10, C.sky);
    for (let i = 0; i < 9; i++) {
      const c = [C.pink, C.sun, C.lime, C.sky, C.blue, C.pink, C.lime, C.sky, C.sun][i];
      box(ctx, cx - 41 + (i % 3) * 29, cy - 41 + Math.floor(i / 3) * 29, 24, 24, 7, c);
    }
    spark(ctx, cx + 92, cy - 82, 18, C.paper);
    spark(ctx, cx - 120, cy + 100, 12, C.sun);
  },
};

/** @type {Art} */
const artMyWay = {
  w: 620,
  h: 470,
  draw(ctx) {
    const a = [40, 470, 600, 450, 600, 270, 320, 262];
    const b = [320, 262, 40, 254, 60, 70, 470, 66];
    // Hills.
    circle(ctx, 80, 520, 200, mix(C.lime, '#2e7d32', 0.25));
    circle(ctx, 560, 540, 220, mix(C.lime, '#2e7d32', 0.4));
    // Road: verge, asphalt, centre line.
    for (const [w, c, dash] of /** @type {[number, string, number[]][]} */ ([
      [86, C.paper, []],
      [70, C.navy, []],
      [6, C.sun, [22, 18]],
    ])) {
      ctx.beginPath();
      bezierPath(ctx, a);
      ctx.bezierCurveTo(b[2], b[3], b[4], b[5], b[6], b[7]);
      ctx.lineWidth = w;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = c;
      ctx.setLineDash(dash);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Trees.
    for (const [x, y, s] of [
      [520, 170, 1],
      [120, 360, 0.8],
      [570, 330, 0.7],
      [40, 170, 0.75],
    ]) {
      box(ctx, x - 6 * s, y, 12 * s, 46 * s, 4, mix(C.navy, '#8a5536', 0.6));
      circle(ctx, x, y, 34 * s, mix(C.lime, '#2e7d32', 0.55));
      circle(ctx, x - 8 * s, y - 8 * s, 16 * s, mix(C.lime, '#ffffff', 0.15));
    }
    // Milestones along the road.
    const stops = /** @type {[number[], number, string, number][]} */ ([
      [a, 0.3, 'Arrivée', -1],
      [a, 0.82, 'Montée', 1],
      [b, 0.35, 'Mobilité', 1],
    ]);
    stops.forEach(([p, t, label, side], i) => {
      const [x, y] = bezierAt(p, t);
      circle(ctx, x, y, 30, C.paper);
      circle(ctx, x, y, 22, C.pink);
      text(ctx, String(i + 1), x, y + 10, 28, '#ffffff', { align: 'center' });
      const w = measure(ctx, label, 24, 850) + 28;
      const lx = side > 0 ? x + 40 : x - 40 - w;
      box(ctx, lx, y - 20, w, 40, 20, C.blue);
      text(ctx, label, lx + w / 2, y + 9, 24, C.paper, { align: 'center', weight: 850 });
    });
    // Finish flag and star.
    path(ctx, [474, 66, 474, -10], 8, C.navy);
    poly(ctx, [478, -6, 560, 10, 478, 30], C.pink);
    starShape(ctx, 560, 70, 30, 13, C.sun);
    spark(ctx, 400, 26, 14, C.paper);
  },
};

/** @type {Art} */
const artSpark = {
  w: 600,
  h: 540,
  draw(ctx) {
    const cx = 300;
    const cy = 200;
    glow(ctx, cx, cy, 280, C.sun, 0.55);
    for (let i = 0; i < 11; i++) {
      const ang = Math.PI * (0.9 + (i * 1.2) / 10);
      path(
        ctx,
        [
          cx + Math.cos(ang) * 168,
          cy + Math.sin(ang) * 168,
          cx + Math.cos(ang) * (i % 2 ? 200 : 215),
          cy + Math.sin(ang) * (i % 2 ? 200 : 215),
        ],
        12,
        i % 2 ? C.pink : C.sun,
      );
    }
    // Glass.
    ctx.beginPath();
    ctx.arc(cx, cy, 140, Math.PI * 0.78, Math.PI * 2.22);
    ctx.lineTo(cx + 66, cy + 196);
    ctx.lineTo(cx - 66, cy + 196);
    ctx.closePath();
    ctx.fillStyle = C.sun;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - 70, cy - 60, 26, 48, 0.6, 0, TAU);
    ctx.fillStyle = mix(C.sun, '#ffffff', 0.6);
    ctx.fill();
    bolt(ctx, cx + 8, cy + 30, 108, mix(C.sun, C.pink, 0.6));
    bolt(ctx, cx, cy + 22, 108, C.navy);
    // Screw base.
    for (let i = 0; i < 3; i++) {
      box(ctx, cx - 72 + i * 4, cy + 196 + i * 30, 144 - i * 8, 26, 12, i % 2 ? C.sky : C.paper);
    }
    box(ctx, cx - 30, cy + 284, 60, 24, [0, 0, 14, 14], C.paper);
    // The fuse, already lit.
    const fuse = [cx, cy + 306, cx + 20, cy + 360, cx + 200, cy + 300, cx + 220, cy + 250];
    ctx.beginPath();
    bezierPath(ctx, fuse);
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = mix(C.sun, '#8a5536', 0.5);
    ctx.stroke();
    ctx.beginPath();
    bezierPath(ctx, fuse);
    ctx.lineWidth = 4;
    ctx.setLineDash([6, 10]);
    ctx.strokeStyle = C.paper;
    ctx.stroke();
    ctx.setLineDash([]);
    const fx = cx + 220;
    const fy = cy + 250;
    glow(ctx, fx, fy, 80, C.sun, 0.8);
    spark(ctx, fx, fy, 44, C.sun);
    spark(ctx, fx, fy, 24, '#ffffff');
    const r = rng(11);
    for (let i = 0; i < 9; i++) {
      const ang = r() * TAU;
      const d = 46 + r() * 30;
      circle(
        ctx,
        fx + Math.cos(ang) * d,
        fy + Math.sin(ang) * d,
        3 + r() * 4,
        i % 2 ? C.pink : C.sun,
      );
    }
    spark(ctx, 60, 60, 20, C.sky);
    spark(ctx, 540, 40, 14, C.pink);
  },
};

/** @type {Art} */
const artFluent = {
  w: 620,
  h: 460,
  draw(ctx) {
    const cx = 310;
    const cy = 250;
    // Globe.
    circle(ctx, cx + 8, cy + 10, 140, mix(C.pink, C.navy, 0.5));
    circle(ctx, cx, cy, 140, C.sky);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 140, 0, TAU);
    ctx.clip();
    ctx.fillStyle = C.lime;
    for (const [x, y, rx, ry, a] of [
      [-60, -50, 58, 40, 0.4],
      [-30, 40, 34, 60, -0.3],
      [70, -30, 50, 34, -0.2],
      [80, 60, 30, 40, 0.5],
    ]) {
      ctx.beginPath();
      ctx.ellipse(cx + x, cy + y, rx, ry, a, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = mix(C.sky, C.paper, 0.55);
    ctx.lineWidth = 4;
    for (const rx of [50, 100]) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, 140, 0, 0, TAU);
      ctx.stroke();
    }
    for (const dy of [-70, 0, 70])
      path(ctx, [cx - 150, cy + dy, cx + 150, cy + dy], 4, mix(C.sky, C.paper, 0.55));
    ctx.restore();
    // Headphones.
    arc(ctx, cx, cy, 168, 22, C.navy, Math.PI * 1.08, Math.PI * 1.92);
    for (const sx of [-1, 1]) {
      box(ctx, cx + sx * 170 - 26, cy - 50, 52, 104, 24, C.navy);
      box(ctx, cx + sx * 148 - 12, cy - 38, 24, 80, 12, C.sun);
    }
    // Hello in many languages.
    bubble(ctx, 0, 10, 'Hello!', 40, C.sun, C.navy, 1);
    bubble(ctx, 412, 0, '¡Hola!', 40, C.paper, C.pink, -1);
    bubble(ctx, 4, 340, 'Ciao!', 40, C.lime, C.navy, 1);
    bubble(ctx, 440, 350, 'Hallo!', 36, C.navy, C.paper, -1);
    bubble(ctx, 236, 384, 'Olá!', 32, C.blue, C.paper, 0);
  },
};

/** @type {Art} */
const artPrimo = {
  w: 420,
  h: 620,
  draw(ctx) {
    // Monitor.
    box(ctx, 8, 28, 412, 330, 26, mix(C.navy, '#000000', 0.3));
    box(ctx, 0, 20, 412, 330, 26, C.navy);
    box(ctx, 18, 38, 376, 290, 14, mix(C.navy, C.blue, 0.45));
    box(ctx, 18, 38, 376, 40, [14, 14, 0, 0], mix(C.navy, C.blue, 0.2));
    text(ctx, 'PRIMO', 36, 68, 24, C.lime, { weight: 900, spacing: 2 });
    for (let i = 0; i < 3; i++) circle(ctx, 370 - i * 20, 58, 6, [C.pink, C.sun, C.lime][i]);
    // Two gauges.
    for (const [x, v, c] of /** @type {[number, number, string][]} */ ([
      [100, 0.72, C.lime],
      [228, 0.45, C.sun],
    ])) {
      const y = 170;
      arc(ctx, x, y, 48, 16, mix(C.navy, C.blue, 0.15), Math.PI, TAU);
      arc(ctx, x, y, 48, 16, c, Math.PI, Math.PI * (1 + v));
      const ang = Math.PI * (1 + v);
      path(ctx, [x, y, x + Math.cos(ang) * 38, y + Math.sin(ang) * 38], 6, C.paper);
      circle(ctx, x, y, 8, C.paper);
      text(ctx, `${Math.round(v * 100)}%`, x, y + 36, 22, C.paper, {
        align: 'center',
        weight: 850,
      });
    }
    // KPI tile.
    box(ctx, 290, 100, 88, 104, 14, C.lime);
    text(ctx, '+12', 334, 150, 34, C.navy, { align: 'center' });
    path(ctx, [314, 180, 334, 166, 354, 180], 6, C.navy);
    // Bars + trend.
    const hs = [40, 64, 52, 84, 70, 98];
    hs.forEach((h, i) =>
      box(ctx, 40 + i * 30, 312 - h, 20, h, [6, 6, 0, 0], i % 2 ? C.sky : C.pink),
    );
    path(ctx, [236, 296, 270, 276, 300, 286, 334, 250, 372, 232], 6, C.sun);
    circle(ctx, 372, 232, 9, C.sun);
    // Stand.
    poly(ctx, [176, 350, 236, 350, 250, 420, 162, 420], mix(C.navy, C.blue, 0.3));
    box(ctx, 100, 414, 212, 24, 12, C.navy);
    // Coffee mug.
    box(ctx, 330, 370, 70, 70, [6, 6, 20, 20], C.paper);
    arc(ctx, 400, 404, 18, 8, C.paper, -Math.PI / 2, Math.PI / 2);
    box(ctx, 340, 380, 50, 10, 5, mix(C.sun, '#8a5536', 0.6));
    for (const x of [352, 376])
      path(ctx, [x, 356, x + 6, 340, x, 326], 5, mix(C.paper, C.sky, 0.4));
    // View counter.
    box(ctx, 20, 490, 380, 96, 48, C.paper);
    ctx.save();
    ctx.translate(86, 538);
    ctx.beginPath();
    ctx.moveTo(-44, 0);
    ctx.quadraticCurveTo(0, -46, 44, 0);
    ctx.quadraticCurveTo(0, 46, -44, 0);
    ctx.fillStyle = C.navy;
    ctx.fill();
    circle(ctx, 0, 0, 18, C.sky);
    circle(ctx, 0, 0, 8, C.navy);
    circle(ctx, 5, -5, 4, '#ffffff');
    ctx.restore();
    text(ctx, '9 999+', 150, 556, 50, C.blue, { maxW: 230 });
    spark(ctx, 400, 470, 18, C.lime);
  },
};

/** @type {Art} */
const artCopil = {
  w: 900,
  h: 380,
  draw(ctx) {
    // Gantt board on the wall.
    box(ctx, 6, 26, 320, 336, 22, mix(C.navy, '#000000', 0.2));
    box(ctx, 0, 20, 320, 336, 22, C.navy);
    box(ctx, 16, 36, 288, 304, 12, C.paper);
    text(ctx, 'PLANNING', 32, 72, 26, C.navy, { spacing: 2 });
    for (let i = 0; i < 6; i++)
      path(ctx, [32 + i * 52, 88, 32 + i * 52, 322], 2, mix(C.navy, C.paper, 0.82));
    const bars = /** @type {[number, number, string][]} */ ([
      [32, 110, C.blue],
      [90, 120, C.sky],
      [150, 100, C.pink],
      [120, 140, C.lime],
      [196, 92, C.sun],
      [230, 64, C.blue],
    ]);
    bars.forEach(([x, w, c], i) => box(ctx, x, 100 + i * 36, w, 22, 11, c));
    path(ctx, [184, 86, 184, 326], 5, C.pink, [10, 8]);
    circle(ctx, 184, 86, 9, C.pink);
    // Chairs, then the table seen from above.
    const tx = 400;
    const tw = 460;
    const ty = 110;
    const th = 180;
    for (let i = 0; i < 5; i++) {
      const x = tx + 60 + i * 85;
      circle(ctx, x, ty - 6, 28, mix(C.navy, C.blue, 0.3));
      circle(ctx, x, ty + th + 6, 28, mix(C.navy, C.blue, 0.3));
    }
    circle(ctx, tx - 6, ty + th / 2, 28, mix(C.navy, C.blue, 0.3));
    circle(ctx, tx + tw + 6, ty + th / 2, 28, C.pink);
    box(ctx, tx + 8, ty + 10, tw, th, 70, mix(C.navy, '#000000', 0.25));
    box(ctx, tx, ty, tw, th, 70, C.blue);
    box(ctx, tx + 16, ty + 16, tw - 32, th - 32, 56, mix(C.blue, C.sky, 0.25));
    // Laptops.
    for (const [x, y, a] of [
      [tx + 80, ty + 50, 0.1],
      [tx + 250, ty + 46, -0.08],
      [tx + 160, ty + 132, 3.1],
      [tx + 360, ty + 134, 3.2],
    ]) {
      at(ctx, x, y, a, () => {
        box(ctx, -36, -22, 72, 44, 6, C.paper);
        box(ctx, -30, -18, 60, 26, 4, C.navy);
        box(ctx, -24, 12, 48, 5, 2, mix(C.paper, C.navy, 0.3));
      });
    }
    // Sticky notes.
    const notes = [C.sun, C.pink, C.lime, C.sun, C.sky];
    notes.forEach((c, i) => {
      at(ctx, tx + 160 + i * 34, ty + 90 + (i % 2 ? 6 : -6), (i - 2) * 0.12, () => {
        box(ctx, -16, -16, 32, 32, 3, c);
        box(ctx, -10, -6, 20, 3, 1, mix(c, C.navy, 0.45));
        box(ctx, -10, 2, 14, 3, 1, mix(c, C.navy, 0.45));
      });
    });
    // Coffee cups.
    for (const [x, y] of [
      [tx + 330, ty + 60],
      [tx + 60, ty + 128],
      [tx + 420, ty + 90],
    ]) {
      path(ctx, [x + 14, y, x + 24, y], 7, C.paper);
      circle(ctx, x, y, 16, C.paper);
      circle(ctx, x, y, 11, mix(C.sun, '#5e3a26', 0.7));
    }
    // Wall clock: on time.
    circle(ctx, 860, 40, 36, C.paper);
    ring(ctx, 860, 40, 36, 6, C.navy);
    path(ctx, [860, 40, 860, 16], 6, C.navy);
    path(ctx, [860, 40, 878, 40], 6, C.navy);
    circle(ctx, 860, 40, 5, C.pink);
    spark(ctx, 360, 40, 16, C.pink);
  },
};

/** Heart-shaped curve point. @param {number} t */
function heartCurve(t) {
  const s = Math.sin(t);
  return [
    16 * s * s * s,
    -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
  ];
}

/** @type {Art} */
const artCarpool = {
  w: 620,
  h: 460,
  draw(ctx) {
    const cx = 310;
    const cy = 190;
    const k = 14;
    /** @param {number} t */
    const pt = (t) => {
      const [x, y] = heartCurve(t);
      return [cx + x * k, cy + y * k];
    };
    const route = () => {
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const [x, y] = pt((i / 120) * TAU);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
    };
    route();
    ctx.fillStyle = mix(C.lime, C.paper, 0.35);
    ctx.fill();
    for (const [w, c, dash] of /** @type {[number, string, number[]][]} */ ([
      [62, C.paper, []],
      [48, C.navy, []],
      [5, C.sun, [16, 16]],
    ])) {
      route();
      ctx.lineWidth = w;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = c;
      ctx.setLineDash(dash);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Parking sign in the middle of the heart.
    box(ctx, cx - 6, cy + 30, 12, 110, 4, C.navy);
    box(ctx, cx - 62, cy - 70, 124, 124, 24, C.paper);
    box(ctx, cx - 54, cy - 62, 108, 108, 18, C.blue);
    text(ctx, 'P', cx, cy + 16, 92, C.paper, { align: 'center' });
    box(ctx, cx - 40, cy + 64, 80, 40, 12, C.sun);
    text(ctx, 'B2', cx, cy + 96, 30, C.navy, { align: 'center' });
    // Two cars sharing the route.
    /** @param {number} t @param {string} body */
    const car = (t, body) => {
      const [x0, y0] = pt(t);
      const [x1, y1] = pt(t + 0.01);
      at(ctx, x0, y0, Math.atan2(y1 - y0, x1 - x0), () => {
        for (const [wx, wy] of [
          [-20, -22],
          [20, -22],
          [-20, 16],
          [20, 16],
        ])
          box(ctx, wx - 9, wy, 18, 6, 3, C.navy);
        box(ctx, -38, -20, 76, 40, 14, body);
        box(ctx, 6, -15, 16, 30, 6, mix(C.sky, C.navy, 0.2));
        box(ctx, -26, -15, 12, 30, 5, mix(C.sky, C.navy, 0.2));
        box(ctx, -12, -15, 16, 30, 4, mix(body, '#ffffff', 0.3));
        circle(ctx, 34, -12, 4, C.sun);
        circle(ctx, 34, 12, 4, C.sun);
      });
    };
    car(4.75, C.pink);
    car(1.2, C.sun);
    // Little hearts floating up.
    heart(ctx, 560, 70, 20, C.pink);
    heart(ctx, 60, 60, 14, C.pink);
    heart(ctx, 588, 140, 10, mix(C.pink, '#ffffff', 0.4));
    spark(ctx, 70, 400, 16, C.paper);
  },
};

/** @type {Art} */
const artExpenses = {
  w: 620,
  h: 440,
  draw(ctx) {
    // Trail: receipt → fold → plane.
    ctx.beginPath();
    ctx.moveTo(190, 230);
    ctx.bezierCurveTo(250, 340, 360, 330, 380, 240);
    ctx.bezierCurveTo(400, 150, 430, 130, 480, 120);
    ctx.setLineDash([12, 14]);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.navy;
    ctx.stroke();
    ctx.setLineDash([]);
    // Receipt.
    at(ctx, 110, 220, -0.1, () => {
      box(ctx, -86, -186, 172, 340, 6, mix(C.navy, C.lime, 0.4));
      ctx.beginPath();
      ctx.moveTo(-90, -190);
      ctx.lineTo(90, -190);
      ctx.lineTo(90, 170);
      for (let i = 0; i < 6; i++) {
        ctx.lineTo(90 - (i + 0.5) * 30, 188);
        ctx.lineTo(90 - (i + 1) * 30, 170);
      }
      ctx.closePath();
      ctx.fillStyle = C.paper;
      ctx.fill();
      text(ctx, 'FRAIS', 0, -142, 34, C.navy, { align: 'center', spacing: 2 });
      for (let i = 0; i < 4; i++) {
        box(ctx, -66, -110 + i * 34, 76 - (i % 2) * 24, 10, 5, mix(C.navy, C.paper, 0.6));
        box(ctx, 30, -110 + i * 34, 36, 10, 5, mix(C.navy, C.paper, 0.45));
      }
      path(ctx, [-66, 40, 66, 40], 4, C.navy, [8, 8]);
      text(ctx, '18,50 €', 66, 100, 38, C.blue, { align: 'right', maxW: 140 });
      box(ctx, -66, 118, 70, 26, 13, C.lime);
      check(ctx, -31, 131, 9, 5, C.navy);
    });
    // Half-folded sheet.
    at(ctx, 380, 300, 0.25, () => {
      poly(ctx, [-50, 90, -50, -10, 0, -70, 50, -10, 50, 90], C.paper);
      poly(ctx, [0, -70, -50, -10, -6, 10], mix(C.paper, C.sky, 0.35));
      poly(ctx, [0, -70, 50, -10, 6, 10], mix(C.paper, C.navy, 0.15));
      path(ctx, [0, -70, 0, 90], 3, mix(C.paper, C.navy, 0.3));
    });
    // Paper plane.
    at(ctx, 530, 110, -0.3, () => {
      poly(ctx, [90, 0, -90, -60, -30, 6], C.paper);
      poly(ctx, [90, 0, -30, 6, -64, 48], mix(C.paper, C.navy, 0.25));
      poly(ctx, [90, 0, -30, 6, -40, 22], mix(C.paper, C.sky, 0.4));
    });
    // Calendar: the 5th, all good.
    at(ctx, 540, 330, 0.08, () => {
      box(ctx, -66, -60, 132, 130, 18, C.navy);
      box(ctx, -60, -54, 120, 118, 14, '#ffffff');
      box(ctx, -60, -54, 120, 32, [14, 14, 0, 0], C.pink);
      for (const x of [-30, 30]) box(ctx, x - 5, -70, 10, 26, 5, C.navy);
      text(ctx, '5', 0, 50, 72, C.navy, { align: 'center' });
    });
    circle(ctx, 598, 266, 26, C.lime);
    check(ctx, 598, 268, 12, 7, C.navy);
    spark(ctx, 300, 60, 20, C.paper);
    spark(ctx, 440, 30, 12, C.navy);
  },
};

// ---------------------------------------------------------------- LCP7 (custom scene)

/** @param {Ctx} ctx */
function drawLcp7(ctx) {
  const W = 1024;
  const H = 768;
  const horizon = 520;
  ctx.fillStyle = grad(ctx, 0, 0, 0, horizon, [
    C.sky,
    mix(C.sky, C.paper, 0.4),
    mix(C.sun, C.paper, 0.35),
  ]);
  ctx.fillRect(0, 0, W, H);
  glow(ctx, 500, 470, 230, C.sun, 0.55);
  circle(ctx, 500, 470, 100, mix(C.sun, '#ffffff', 0.3));
  circle(ctx, 500, 470, 72, C.sun);
  // Clouds, shaded underneath.
  for (const [x, y, s] of [
    [640, 110, 1],
    [930, 200, 0.7],
  ]) {
    box(ctx, x - 90 * s, y + 6 * s, 180 * s, 44 * s, 22 * s, mix('#ffffff', C.sky, 0.3));
    box(ctx, x - 90 * s, y, 180 * s, 40 * s, 20 * s, '#ffffff');
    circle(ctx, x - 20 * s, y, 40 * s, '#ffffff');
    circle(ctx, x + 30 * s, y + 6 * s, 30 * s, '#ffffff');
  }
  // Birds over the Erdre.
  for (const [x, y, s] of [
    [570, 236, 1],
    [606, 258, 0.75],
    [542, 266, 0.6],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x - 16 * s, y);
    ctx.quadraticCurveTo(x - 7 * s, y - 11 * s, x, y);
    ctx.quadraticCurveTo(x + 7 * s, y - 11 * s, x + 16 * s, y);
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.navy;
    ctx.stroke();
  }
  // Far trees.
  const tree = mix(C.lime, '#2e7d32', 0.55);
  const tree2 = mix(C.lime, '#2e7d32', 0.3);
  for (let i = 0; i < 20; i++) circle(ctx, i * 56, horizon - 6 - (i % 3) * 10, 46, tree);
  // Building: LCP7, glass and white bands.
  const glass = grad(ctx, 0, 280, 0, 520, [mix(C.sky, '#ffffff', 0.2), mix(C.sky, C.blue, 0.45)]);
  box(ctx, 630, 354, 370, 170, 8, SHADE);
  box(ctx, 620, 344, 370, 176, 8, '#ffffff');
  box(ctx, 690, 290, 240, 60, 8, SHADE);
  box(ctx, 680, 280, 240, 64, 8, mix('#ffffff', C.sky, 0.12));
  box(ctx, 612, 338, 386, 12, 4, mix(C.navy, C.blue, 0.4));
  box(ctx, 672, 272, 256, 10, 4, mix(C.navy, C.blue, 0.4));
  /** @param {number} x @param {number} y @param {number} w @param {number} h */
  const pane = (x, y, w, h) => {
    box(ctx, x, y, w, h, 4, glass);
    poly(
      ctx,
      [x + 4, y + h - 6, x + w * 0.55, y + 4, x + w * 0.8, y + 4, x + 4, y + h * 0.95],
      alpha('#ffffff', 0.35),
    );
  };
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) pane(636 + c * 44, 362 + r * 50, 34, 38);
  for (let c = 0; c < 5; c++) pane(696 + c * 44, 292, 38, 42);
  // The "7" on the roof.
  path(ctx, [950, 272, 950, 226], 8, C.navy);
  box(ctx, 918, 158, 76, 76, 14, SHADE);
  box(ctx, 912, 150, 76, 76, 14, C.lime);
  box(ctx, 918, 156, 64, 10, 5, mix(C.lime, '#ffffff', 0.45));
  text(ctx, '7', 950, 212, 66, C.navy, { align: 'center' });
  for (let i = 0; i < 10; i++) circle(ctx, 30 + i * 52, horizon - (i % 2) * 18, 38, tree2);
  for (let i = 0; i < 9; i++) circle(ctx, 600 + i * 52, horizon + 4 - (i % 2) * 14, 30, tree2);
  // The Erdre, with reflections.
  ctx.fillStyle = grad(ctx, 0, horizon, 0, H, [mix(C.blue, C.sky, 0.4), C.blue]);
  ctx.fillRect(0, horizon, W, H - horizon);
  ctx.save();
  ctx.globalAlpha = 0.12;
  for (let c = 0; c < 8; c++) box(ctx, 636 + c * 44, horizon + 14, 34, 70, 2, C.navy);
  ctx.restore();
  for (let i = 0; i < 6; i++) {
    box(ctx, 500 - (90 - i * 12), horizon + 16 + i * 26, (90 - i * 12) * 2, 8, 4, C.sun);
  }
  for (let i = 0; i < 8; i++) {
    box(ctx, 660 + (i % 3) * 110, horizon + 20 + i * 18, 60, 5, 3, mix('#ffffff', C.sky, 0.3));
  }
  // Sailboat and its wake.
  path(ctx, [110, 652, 150, 652], 4, alpha('#ffffff', 0.6));
  path(ctx, [290, 652, 340, 652], 4, alpha('#ffffff', 0.6));
  oval(ctx, 220, 656, 70, 8, alpha(C.navy, 0.25));
  poly(ctx, [160, 620, 280, 620, 260, 648, 180, 648], C.paper);
  box(ctx, 166, 626, 108, 6, 3, C.pink);
  path(ctx, [216, 620, 216, 516], 4, C.navy);
  poly(ctx, [220, 612, 220, 520, 284, 612], C.pink);
  poly(ctx, [220, 612, 220, 520, 240, 612], mix(C.pink, '#ffffff', 0.25));
  poly(ctx, [212, 612, 212, 540, 166, 612], '#ffffff');
  poly(ctx, [220, 516, 244, 524, 220, 532], C.lime);

  /** @type {Spec} */
  const s = {
    ...SPECS['inetum-lcp7'],
    custom: undefined,
  };
  kicker(ctx, 'Inetum · Nantes', 66, 92, 28, C.navy);
  titleBlock(ctx, s, 60, 96, 520, 210);
  text(ctx, 'La Chapelle-sur-Erdre', 66, 344, 44, C.blue, { weight: 850 });
  taglineCard(ctx, s, 40, 670, 30, 640, 'left');
  footer(ctx, W - 50, H - 36, 24, C.paper, 'right');
}

/** Friendly face on a rounded app icon. @param {Ctx} ctx @param {number} x @param {number} y @param {number} s @param {string} c */
function appFace(ctx, x, y, s, c) {
  circle(ctx, x - s * 0.2, y - s * 0.05, s * 0.07, c);
  circle(ctx, x + s * 0.2, y - s * 0.05, s * 0.07, c);
  arc(ctx, x, y + s * 0.02, s * 0.2, s * 0.06, c, 0.15 * Math.PI, 0.85 * Math.PI);
}

/** Avatar bust centred on x,y with radius r. @param {Ctx} ctx @param {number} x @param {number} y @param {number} r
 * @param {string} skin @param {string} hair @param {string} shirt */
function avatar(ctx, x, y, r, skin, hair, shirt) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.clip();
  circle(ctx, x, y, r, mix(shirt, '#ffffff', 0.55));
  circle(ctx, x, y + r * 1.0, r * 0.75, shirt);
  circle(ctx, x, y - r * 0.15, r * 0.4, skin);
  ctx.beginPath();
  ctx.arc(x, y - r * 0.2, r * 0.43, Math.PI * 1.02, Math.PI * 1.98);
  ctx.closePath();
  ctx.fillStyle = hair;
  ctx.fill();
  ctx.restore();
  arc(ctx, x, y, r, r * 0.07, C.navy);
}

/** @type {Art} */
const artMe = {
  w: 620,
  h: 440,
  draw(ctx) {
    const px = 195;
    const py = 10;
    box(ctx, px + 8, py + 12, 230, 420, 44, mix(C.navy, '#000000', 0.4));
    box(ctx, px, py, 230, 420, 44, C.navy);
    box(ctx, px + 12, py + 12, 206, 396, 34, C.paper);
    box(ctx, px + 12, py + 12, 206, 78, [34, 34, 0, 0], C.blue);
    avatar(ctx, px + 52, py + 52, 22, SKIN[1], HAIR[1], C.pink);
    text(ctx, 'Salut !', px + 84, py + 62, 28, C.paper, { maxW: 110 });
    const tiles = [
      C.sky,
      C.sun,
      mix(C.pink, '#ffffff', 0.35),
      C.lime,
      mix(C.blue, '#ffffff', 0.6),
      C.sun,
    ];
    for (let i = 0; i < 6; i++) {
      const tx = px + 25 + (i % 2) * 102;
      const ty = py + 106 + Math.floor(i / 2) * 98;
      box(ctx, tx, ty + 4, 92, 86, 20, mix(tiles[i], C.navy, 0.25));
      box(ctx, tx, ty, 92, 86, 20, tiles[i]);
      const cx = tx + 46;
      const cy = ty + 43;
      if (i === 0) {
        circle(ctx, cx, cy - 8, 14, C.navy);
        box(ctx, cx - 24, cy + 10, 48, 26, [22, 22, 6, 6], C.navy);
      } else if (i === 1) {
        circle(ctx, cx, cy, 15, C.navy);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU;
          path(
            ctx,
            [
              cx + Math.cos(a) * 22,
              cy + Math.sin(a) * 22,
              cx + Math.cos(a) * 31,
              cy + Math.sin(a) * 31,
            ],
            5,
            C.navy,
          );
        }
      } else if (i === 2) {
        box(ctx, cx - 22, cy - 18, 38, 40, 8, C.navy);
        arc(ctx, cx + 16, cy + 2, 12, 6, C.navy, -Math.PI / 2, Math.PI / 2);
        box(ctx, cx - 22, cy + 4, 38, 18, [0, 0, 8, 8], C.sun);
        path(ctx, [cx - 12, cy - 26, cx - 6, cy - 36], 4, C.navy);
        path(ctx, [cx + 2, cy - 26, cx + 8, cy - 36], 4, C.navy);
        box(ctx, cx - 28, cy + 24, 56, 6, 3, C.navy);
      } else if (i === 3) {
        box(ctx, cx - 20, cy - 28, 40, 54, 7, C.navy);
        for (let k = 0; k < 3; k++) box(ctx, cx - 12, cy - 17 + k * 14, 24, 5, 2, C.lime);
      } else if (i === 4) {
        heart(ctx, cx, cy, 20, C.navy);
      } else {
        arc(ctx, cx, cy, 24, 6, C.navy);
        path(ctx, [cx, cy - 14, cx, cy, cx + 11, cy + 8], 6, C.navy);
      }
    }
    // Notification bubbles.
    box(ctx, 440, 40, 170, 78, 26, C.sun);
    poly(ctx, [452, 108, 480, 108, 446, 140], C.sun);
    text(ctx, 'Café ?', 525, 76, 32, C.navy, { align: 'center', maxW: 140 });
    text(ctx, 'presque…', 525, 106, 28, C.blue, { align: 'center', weight: 800, maxW: 140 });
    box(ctx, 10, 250, 160, 68, 24, C.lime);
    poly(ctx, [140, 308, 168, 308, 168, 338], C.lime);
    check(ctx, 52, 284, 14, 8, C.navy);
    text(ctx, 'Congés OK', 116, 292, 26, C.navy, { align: 'center', maxW: 90 });
    heart(ctx, 520, 260, 26, C.pink);
    spark(ctx, 60, 90, 26, C.sun);
    spark(ctx, 560, 380, 22, C.sky);
    spark(ctx, 110, 400, 16, C.paper);
  },
};

/** @type {Art} */
const artAdopt = {
  w: 620,
  h: 420,
  draw(ctx) {
    const cx = 310;
    // Handle, behind the little tools peeking out of the box.
    arc(ctx, cx, 270, 150, 18, C.navy, Math.PI * 1.12, Math.PI * 1.88);
    /** @type {[number, number, number, string, number][]} */
    const icons = [
      [150, 190, -0.25, C.sky, 96],
      [255, 130, 0.1, C.lime, 104],
      [370, 150, -0.08, C.sun, 100],
      [470, 205, 0.28, C.paper, 92],
    ];
    for (const [x, y, a, c, s] of icons) {
      at(ctx, x, y, a, () => {
        box(ctx, -s / 2, -s / 2 + 6, s, s, s * 0.24, mix(c, C.navy, 0.35));
        box(ctx, -s / 2, -s / 2, s, s, s * 0.24, c);
        appFace(ctx, 0, 0, s, C.navy);
      });
    }
    // Body.
    box(ctx, 90, 252, 440, 150, 30, mix(C.pink, C.navy, 0.35));
    box(ctx, 90, 244, 440, 150, 30, C.pink);
    box(ctx, 90, 244, 440, 36, [30, 30, 0, 0], mix(C.pink, '#ffffff', 0.3));
    box(ctx, cx - 36, 262, 72, 52, 12, C.sun);
    box(ctx, cx - 14, 276, 28, 24, 6, C.navy);
    // Wrench and hammer on the front.
    at(ctx, 190, 340, -0.5, () => {
      box(ctx, -8, -44, 16, 88, 8, C.paper);
      circle(ctx, 0, -48, 20, C.paper);
      box(ctx, -7, -72, 14, 26, 4, C.pink);
    });
    at(ctx, 430, 340, 0.5, () => {
      box(ctx, -8, -34, 16, 84, 8, C.paper);
      box(ctx, -30, -52, 60, 28, 8, C.paper);
    });
    // Adoption tag.
    at(ctx, 90, 110, -0.2, () => {
      box(ctx, -66, -26, 132, 52, 14, C.paper);
      circle(ctx, -50, 0, 6, C.sky);
      text(ctx, 'Adopté !', 8, 10, 30, C.navy, { align: 'center', maxW: 90 });
    });
    heart(ctx, 560, 120, 24, C.pink);
    heart(ctx, 40, 300, 16, C.sun);
    spark(ctx, 560, 300, 24, C.sky);
    spark(ctx, 330, 40, 18, C.paper);
  },
};

/** @type {Art} */
const artAiHub = {
  w: 420,
  h: 640,
  draw(ctx) {
    const cx = 210;
    const cy = 330;
    const nodes = [-90, -30, 30, 90, 150, 210].map((d) => {
      const a = (d * Math.PI) / 180;
      return [cx + Math.cos(a) * 165, cy + Math.sin(a) * 235];
    });
    const cols = [C.sky, C.lime, C.sun, C.pink, C.sky, C.lime];
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, 165, 235, 0, 0, TAU);
    ctx.setLineDash([4, 12]);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = mix(C.sky, C.navy, 0.45);
    ctx.stroke();
    ctx.restore();
    nodes.forEach(([x, y], i) => {
      path(ctx, [cx, cy, x, y], 6, mix(cols[i], C.navy, 0.45));
      // A little data pulse on every link.
      circle(ctx, cx + (x - cx) * 0.55, cy + (y - cy) * 0.55, 7, cols[i]);
    });
    nodes.forEach(([x, y], i) => {
      glow(ctx, x, y, 78, cols[i], 0.45);
      circle(ctx, x, y, 44, mix(cols[i], C.navy, 0.3));
      circle(ctx, x, y, 38, cols[i]);
      if (i === 0) {
        box(ctx, x - 20, y - 18, 40, 28, 10, C.navy);
        poly(ctx, [x - 8, y + 8, x + 4, y + 8, x - 10, y + 22], C.navy);
      } else if (i === 1) {
        box(ctx, x - 16, y - 22, 32, 44, 5, C.navy);
        for (let k = 0; k < 3; k++) box(ctx, x - 9, y - 12 + k * 10, 18, 4, 2, cols[i]);
      } else if (i === 2) {
        for (let k = 0; k < 3; k++)
          box(ctx, x - 20 + k * 15, y + 16 - (14 + k * 11), 11, 14 + k * 11, 3, C.navy);
      } else if (i === 3) {
        // Shield: trust.
        poly(
          ctx,
          [x - 20, y - 18, x + 20, y - 18, x + 20, y + 2, x, y + 24, x - 20, y + 2],
          C.navy,
        );
        check(ctx, x, y - 2, 8, 5, cols[i]);
      } else if (i === 4) {
        spark(ctx, x, y, 24, C.navy);
      } else {
        circle(ctx, x - 9, y - 4, 10, C.navy);
        circle(ctx, x + 10, y - 4, 10, C.navy);
        box(ctx, x - 26, y + 6, 52, 16, 8, C.navy);
      }
    });
    // Friendly robot at the centre.
    glow(ctx, cx, cy, 170, C.sky, 0.5);
    path(ctx, [cx, cy - 88, cx, cy - 118], 7, C.paper);
    circle(ctx, cx, cy - 124, 16, C.pink);
    box(ctx, cx - 112, cy - 24, 24, 60, 11, C.pink);
    box(ctx, cx + 88, cy - 24, 24, 60, 11, C.pink);
    box(ctx, cx - 92, cy - 88, 184, 162, 40, C.paper);
    box(ctx, cx - 72, cy - 66, 144, 108, 26, C.navy);
    arc(ctx, cx - 30, cy - 18, 16, 8, C.sky, Math.PI * 1.1, Math.PI * 1.9);
    arc(ctx, cx + 30, cy - 18, 16, 8, C.sky, Math.PI * 1.1, Math.PI * 1.9);
    arc(ctx, cx, cy, 16, 6, C.pink, 0.2 * Math.PI, 0.8 * Math.PI);
    box(ctx, cx - 44, cy + 66, 88, 26, [0, 0, 12, 12], mix(C.paper, C.sky, 0.4));
    spark(ctx, 40, 90, 22, C.lime);
    spark(ctx, 380, 590, 18, C.pink);
    spark(ctx, 60, 580, 14, C.sky);
  },
};

/** @type {Art} */
const artDirectory = {
  w: 620,
  h: 420,
  draw(ctx) {
    const skins = [SKIN[0], SKIN[3], SKIN[2]];
    const hairs = [HAIR[3], HAIR[0], HAIR[2]];
    const shirts = [C.pink, C.blue, C.lime];
    // Alphabet tabs.
    ['A', 'M', 'Z'].forEach((l, i) => {
      box(ctx, 556, 70 + i * 100, 54, 62, 14, [C.sun, C.sky, C.pink][i]);
      text(ctx, l, 586, 112 + i * 100, 30, C.navy, { align: 'center' });
    });
    // Book.
    box(ctx, 52, 22, 520, 396, 30, mix(C.blue, C.navy, 0.5));
    box(ctx, 40, 8, 520, 396, 30, C.blue);
    box(ctx, 70, 24, 478, 364, 20, C.paper);
    for (let i = 0; i < 6; i++) {
      box(ctx, 22, 40 + i * 60, 44, 20, 10, C.navy);
      circle(ctx, 62, 50 + i * 60, 7, C.paper);
    }
    // Search bar.
    box(ctx, 96, 40, 426, 52, 26, mix(C.sky, C.paper, 0.55));
    arc(ctx, 128, 64, 12, 5, C.navy);
    path(ctx, [137, 73, 146, 82], 5, C.navy);
    text(ctx, 'Prénom Nom…', 164, 77, 26, mix(C.navy, C.paper, 0.4), { weight: 700, maxW: 250 });
    // Rows.
    const names = [124, 100, 138];
    for (let i = 0; i < 3; i++) {
      const y = 112 + i * 92;
      const hl = i === 1;
      box(ctx, 90, y, 438, 80, 24, hl ? C.sun : mix(C.sky, C.paper, 0.8));
      avatar(ctx, 140, y + 40, 28, skins[i], hairs[i], shirts[i]);
      box(ctx, 190, y + 20, names[i] + 60, 16, 8, C.navy);
      box(ctx, 190, y + 46, names[i] + 10, 12, 6, mix(C.navy, C.paper, 0.6));
      circle(ctx, 490, y + 40, 18, hl ? C.navy : C.blue);
      check(ctx, 490, y + 40, 8, 5, C.paper);
    }
    // Cursor clicking the highlighted row.
    poly(ctx, [430, 232, 430, 292, 446, 278, 458, 304, 472, 298, 460, 272, 482, 270], C.navy);
    poly(ctx, [434, 242, 434, 284, 445, 273, 458, 300, 464, 297, 451, 269, 470, 268], C.paper);
    spark(ctx, 500, 220, 18, C.pink);
    spark(ctx, 20, 400, 16, C.sun);
  },
};

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} s @param {string} c */
function note(ctx, x, y, s, c) {
  at(ctx, x, y, -0.2, () => {
    ctx.beginPath();
    ctx.ellipse(0, 0, 13 * s, 9.5 * s, 0, 0, TAU);
    ctx.fillStyle = c;
    ctx.fill();
  });
  box(ctx, x + 9 * s, y - 52 * s, 5 * s, 52 * s, 2 * s, c);
  poly(
    ctx,
    [x + 9 * s, y - 52 * s, x + 30 * s, y - 34 * s, x + 30 * s, y - 24 * s, x + 14 * s, y - 38 * s],
    c,
  );
}

const GOLD = '#f6c453';
const GOLD_DEEP = '#c98a1e';
const PLUM = '#2a1450';

/** @type {Art} */
const artConcert = {
  w: 620,
  h: 420,
  draw(ctx) {
    const cx = 340;
    // Spotlight beams converging on the microphone.
    for (const [sx, c] of /** @type {[number, string][]} */ ([
      [40, C.pink],
      [610, C.sky],
      [330, GOLD],
    ])) {
      const g = ctx.createLinearGradient(sx, 0, cx, 340);
      const [r, gg, b] = rgb(c);
      g.addColorStop(0, `rgba(${r},${gg},${b},0.55)`);
      g.addColorStop(1, `rgba(${r},${gg},${b},0.04)`);
      poly(ctx, [sx - 14, 0, sx + 14, 0, cx + 110, 350, cx - 110, 350], g);
      box(ctx, sx - 26, -10, 52, 26, 8, mix(c, C.navy, 0.35));
      circle(ctx, sx, 14, 12, mix(c, '#ffffff', 0.6));
    }
    // Stage.
    ctx.beginPath();
    ctx.ellipse(cx, 352, 250, 46, 0, 0, TAU);
    ctx.fillStyle = GOLD_DEEP;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, 344, 250, 46, 0, 0, TAU);
    ctx.fillStyle = mix(PLUM, C.navy, 0.3);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, 344, 250, 46, 0, 0, TAU);
    ctx.lineWidth = 5;
    ctx.strokeStyle = GOLD;
    ctx.stroke();
    glow(ctx, cx, 340, 170, GOLD, 0.35);
    // Footlights.
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.18 + (i / 6) * 0.64);
      circle(ctx, cx + Math.cos(a) * 236, 352 + Math.sin(a) * 38, 6, C.paper);
    }
    // Microphone stand.
    ctx.beginPath();
    ctx.ellipse(cx, 340, 58, 13, 0, 0, TAU);
    ctx.fillStyle = C.navy;
    ctx.fill();
    box(ctx, cx - 7, 172, 14, 170, 7, mix(C.navy, '#ffffff', 0.25));
    box(ctx, cx - 11, 236, 22, 18, 6, GOLD);
    // Microphone: gold body, sparkling grille.
    at(ctx, cx, 172, 0.22, () => {
      box(ctx, -15, -92, 30, 100, 12, GOLD);
      box(ctx, -15, -76, 30, 8, 3, GOLD_DEEP);
      box(ctx, -19, -6, 38, 18, 6, mix(C.navy, '#ffffff', 0.25));
      glow(ctx, 0, -116, 90, C.paper, 0.4);
      circle(ctx, 0, -116, 38, mix(C.paper, PLUM, 0.15));
      for (let i = -3; i <= 3; i++)
        for (let j = -3; j <= 3; j++)
          if (i * i + j * j < 11)
            circle(ctx, i * 9.5, -116 + j * 9.5, 2.6, mix(PLUM, C.paper, 0.45));
      box(ctx, -40, -86, 80, 10, 5, GOLD);
    });
    spark(ctx, cx + 76, 34, 18, C.paper);
    spark(ctx, cx - 24, 52, 12, GOLD);
    spark(ctx, cx + 92, 104, 9, C.paper);
    // Hearts and notes floating up.
    heart(ctx, 160, 120, 26, C.pink);
    heart(ctx, 520, 190, 20, C.pink);
    heart(ctx, 470, 70, 14, mix(C.pink, C.paper, 0.4));
    heart(ctx, 210, 230, 12, mix(C.pink, C.paper, 0.4));
    note(ctx, 90, 220, 1.1, GOLD);
    note(ctx, 560, 300, 0.9, C.sky);
    note(ctx, 470, 150, 0.8, GOLD);
    // Golden ticket with its stub.
    at(ctx, 120, 340, -0.14, () => {
      const w = 236;
      const h = 104;
      box(ctx, -w / 2 + 6, -h / 2 + 8, w, h, 14, 'rgba(0,0,0,0.35)');
      box(ctx, -w / 2, -h / 2, w, h, 14, GOLD);
      const sx = w / 2 - 62;
      path(ctx, [sx, -h / 2 + 10, sx, h / 2 - 10], 3, GOLD_DEEP, [2, 8]);
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 14, -h / 2 + 10, sx - (-w / 2 + 14) - 10, h - 20, 8);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = GOLD_DEEP;
      ctx.stroke();
      text(ctx, 'Admission', -w / 2 + 14 + (sx + w / 2 - 24) / 2, -4, 28, PLUM, {
        align: 'center',
        maxW: sx + w / 2 - 44,
      });
      text(ctx, '1 place', -w / 2 + 14 + (sx + w / 2 - 24) / 2, 30, 22, PLUM, {
        weight: 700,
        align: 'center',
        maxW: sx + w / 2 - 44,
      });
      heart(ctx, sx + 31, -2, 15, C.pink);
    });
  },
};

// ---------------------------------------------------------------- catalogue

/** @type {Record<string, Spec>} */
const SPECS = {
  'inetum-lcp7': {
    title: 'Inetum LCP7',
    shape: 'landscape',
    lines: ['LCP7'],
    colors: [C.navy],
    shadow: C.lime,
    tagline: 'Au bord de l’Erdre, le code coule de source.',
    bg: C.sky,
    ink: C.navy,
    accent: C.navy,
    tagBg: C.navy,
    tagFg: C.paper,
    custom: drawLcp7,
  },
  'learning-academy': {
    title: 'Learning Academy',
    shape: 'portrait',
    kicker: 'Formations · Compétences',
    lines: ['LEARNING', 'ACADEMY'],
    colors: [C.navy, C.blue],
    shadow: C.paper,
    tagline: 'Chaque marche est une\ncompétence de plus.',
    bg: C.lime,
    ink: C.navy,
    accent: C.blue,
    tagBg: C.navy,
    tagFg: C.lime,
    art: artLearning,
  },
  chronotime: {
    title: 'Chronotime',
    shape: 'portrait',
    kicker: 'Temps · Absences · Badgeage',
    lines: ['CHRONO', 'TIME'],
    colors: [C.paper, C.sun],
    shadow: C.blue,
    tagline: 'Un petit bip pour vous,\nune grande paix pour la paie.',
    bg: [C.navy, mix(C.navy, C.blue, 0.6)],
    ink: C.sun,
    accent: C.sun,
    tagBg: C.sun,
    tagFg: C.navy,
    art: artChrono,
  },
  'global-service-center': {
    title: 'Global Service Center',
    shape: 'landscape',
    kicker: 'Support IT',
    lines: ['GLOBAL', 'SERVICE', 'CENTER'],
    colors: [C.navy, C.navy, C.paper],
    shadow: mix(C.sky, C.blue, 0.45),
    titleSize: 104,
    tagline: 'On décroche,\nvous respirez.',
    bg: C.sky,
    ink: C.navy,
    accent: C.blue,
    tagBg: C.paper,
    tagFg: C.navy,
    art: artSupport,
    extra(ctx, x, y) {
      const top = y + 28;
      box(ctx, x, top, 440, 76, 38, C.navy);
      text(ctx, '01 78 91 96 51', x + 220, top + 54, 46, C.lime, { align: 'center', maxW: 390 });
      return top + 76;
    },
  },
  'sap-concur': {
    title: 'SAP Concur',
    shape: 'portrait',
    kicker: 'Notes de frais',
    lines: ['SAP', 'CONCUR'],
    colors: [C.paper, C.sky],
    shadow: C.navy,
    tagline: 'Le ticket de caisse ne finit\nplus au fond de la poche.',
    bg: [C.blue, mix(C.blue, C.navy, 0.45)],
    ink: C.sky,
    accent: C.sky,
    tagBg: C.sky,
    tagFg: C.navy,
    art: artConcur,
  },
  mypeopledoc: {
    title: 'MyPeopleDoc',
    shape: 'portrait',
    kicker: 'Documents RH · Bulletins',
    lines: ['MyPeople', 'Doc'],
    colors: [C.blue, C.pink],
    shadow: '#ffffff',
    tagline: 'Zéro classeur, zéro poussière :\nvos papiers RH au chaud.',
    bg: [mix(C.paper, C.sky, 0.3), mix(C.paper, C.blue, 0.22)],
    ink: C.blue,
    accent: C.blue,
    tagBg: C.blue,
    tagFg: C.paper,
    art: artPeopleDoc,
  },
  swile: {
    title: 'Swile',
    shape: 'portrait',
    kicker: 'Repas · Avantages',
    lines: ['SWILE'],
    colors: [C.paper],
    shadow: mix(C.pink, C.navy, 0.45),
    titleSize: 200,
    tagline: 'Midi pile : la meilleure\nréunion de la journée.',
    bg: [C.pink, mix(C.pink, C.sun, 0.25)],
    ink: C.paper,
    accent: C.paper,
    tagBg: C.navy,
    tagFg: C.paper,
    art: artSwile,
  },
  'bon-commande': {
    title: 'Bon de commande',
    shape: 'portrait',
    kicker: 'Achats · Projets',
    lines: ['BON DE', 'COMMANDE'],
    colors: [C.navy],
    shadow: mix(C.pink, C.paper, 0.35),
    tagline: 'Signé, tamponné…\net c’est parti !',
    bg: C.paper,
    ink: C.navy,
    accent: C.pink,
    tagBg: C.pink,
    tagFg: '#ffffff',
    art: artOrder,
  },
  'ordre-mission': {
    title: 'Ordre de mission',
    shape: 'portrait',
    kicker: 'Déplacements',
    lines: ['ORDRE DE', 'MISSION'],
    colors: [C.navy, C.blue],
    shadow: C.paper,
    tagline: 'Valise prête, mission claire :\nbon voyage !',
    bg: [C.sun, mix(C.sun, C.pink, 0.2)],
    ink: C.navy,
    accent: C.navy,
    tagBg: C.navy,
    tagFg: C.sun,
    art: artMission,
  },
  'success-factors': {
    title: 'SuccessFactors',
    shape: 'portrait',
    kicker: 'Objectifs · Entretiens',
    lines: ['SUCCESS', 'FACTORS'],
    colors: [C.paper, C.lime],
    shadow: C.navy,
    tagline: 'Des objectifs clairs,\ndes progrès qui se voient.',
    bg: [mix(C.blue, C.sky, 0.35), C.blue],
    ink: C.paper,
    accent: C.lime,
    tagBg: C.lime,
    tagFg: C.navy,
    art: artSuccess,
  },
  gcomp: {
    title: 'GComp',
    shape: 'portrait',
    kicker: 'Global Compensation',
    lines: ['GCOMP'],
    colors: [C.lime],
    shadow: C.navy,
    titleSize: 200,
    tagline: 'Une rémunération lisible,\nsans formule magique.',
    bg: [mix(C.navy, C.sky, 0.32), mix(C.navy, C.sky, 0.12)],
    ink: C.lime,
    accent: C.lime,
    tagBg: C.lime,
    tagFg: C.navy,
    art: artComp,
  },
  'power-up': {
    title: 'Power UP',
    shape: 'landscape',
    kicker: 'Le programme',
    lines: ['POWER', 'UP !'],
    colors: [C.paper, C.lime],
    shadow: C.navy,
    titleSize: 150,
    tagline: 'Réactivons notre\npuissance collective.',
    bg: [C.blue, mix(C.blue, C.pink, 0.55), C.pink],
    ink: C.paper,
    accent: C.lime,
    tagBg: C.lime,
    tagFg: C.navy,
    art: artPowerUp,
  },
  'power-up-tour': {
    title: 'Power UP Tour',
    shape: 'banner',
    kicker: 'Séminaire · Région Ouest',
    lines: ['POWER UP TOUR'],
    colors: [C.lime],
    shadow: C.blue,
    tagline: 'Prochain arrêt : nos ambitions, ensemble.',
    bg: [C.navy, mix(C.navy, C.blue, 0.7)],
    ink: C.paper,
    accent: C.lime,
    tagBg: C.paper,
    tagFg: C.navy,
    art: artTour,
  },
  'lets-connect': {
    title: "Let's Connect France",
    shape: 'portrait',
    kicker: 'Réseau France',
    lines: ['LET’S', 'CONNECT', 'FRANCE'],
    colors: [C.navy, C.blue, C.pink],
    titleSize: 118,
    tagline: 'Plus proches, plus forts :\nle réseau, c’est nous.',
    bg: C.paper,
    ink: C.navy,
    accent: C.sky,
    tagBg: C.navy,
    tagFg: C.paper,
    art: artConnect,
  },
  'gen-ai': {
    title: 'Gen AI',
    shape: 'portrait',
    lines: ['DO YOU SPEAK', 'GEN AI ?'],
    colors: [C.sky, C.paper],
    shadow: C.pink,
    titleSize: 170,
    tagline: 'L’IA au service de vos métiers,\net vous aux commandes.',
    bg: [C.navy, mix(C.navy, C.pink, 0.35)],
    ink: C.sky,
    accent: C.sky,
    tagBg: C.sky,
    tagFg: C.navy,
    art: artGenAi,
  },
  'charity-day': {
    title: 'Charity Day',
    shape: 'portrait',
    kicker: 'Solidarité',
    lines: ['CHARITY', 'DAY'],
    colors: [C.navy, C.pink],
    shadow: '#ffffff',
    tagline: 'Des petits gestes,\nde grands impacts.',
    bg: [mix(C.paper, C.pink, 0.12), mix(C.paper, C.pink, 0.28)],
    ink: C.navy,
    accent: C.pink,
    tagBg: C.navy,
    tagFg: C.paper,
    art: artCharity,
  },
  'summer-party': {
    title: 'Summer Party',
    shape: 'portrait',
    kicker: 'Save the date',
    lines: ['SUMMER', 'PARTY'],
    colors: [C.paper, C.navy],
    shadow: mix(C.pink, C.navy, 0.35),
    tagline: 'Esprit d’équipe le jour,\npiste de danse le soir.',
    bg: [C.pink, mix(C.pink, C.sun, 0.5), C.sun],
    ink: C.navy,
    accent: C.paper,
    tagBg: C.navy,
    tagFg: C.sun,
    art: artSummer,
  },
  cooptation: {
    title: 'Cooptation',
    shape: 'landscape',
    layout: 'stack',
    kicker: 'Recrutement',
    lines: ['COOPTATION'],
    colors: [C.paper],
    shadow: C.pink,
    titleSize: 130,
    tagline: 'Vous connaissez la perle rare ? Présentez-la-nous !',
    bg: [mix(C.pink, C.navy, 0.55), mix(C.pink, C.navy, 0.75)],
    ink: C.paper,
    accent: C.pink,
    tagBg: C.sun,
    tagFg: C.navy,
    art: artCoopt,
  },
  'espace-vip': {
    title: 'Espace VIP',
    shape: 'banner',
    kicker: 'Direction Région Ouest',
    lines: ['ESPACE VIP'],
    colors: [C.sun],
    shadow: mix(C.pink, C.navy, 0.4),
    tagline: 'Réservé aux grandes idées (et au buffet).',
    bg: [C.navy, mix(C.navy, C.pink, 0.25)],
    ink: C.paper,
    accent: C.sun,
    tagBg: C.pink,
    tagFg: '#ffffff',
    art: artVip,
  },
  'your-digital-hub': {
    title: 'Your Digital Hub',
    shape: 'portrait',
    kicker: 'Intranet · Portail',
    lines: ['YOUR', 'DIGITAL HUB'],
    colors: [C.paper, C.sky],
    shadow: C.blue,
    titleSize: 140,
    tagline: 'Tout est là. Même ce\nque tu cherchais hier.',
    bg: [mix(C.navy, C.blue, 0.55), C.navy],
    ink: C.sky,
    accent: C.sky,
    tagBg: C.sky,
    tagFg: C.navy,
    art: artHub,
  },
  'my-way': {
    title: 'My Way',
    shape: 'portrait',
    kicker: 'Carrière · Mobilité',
    lines: ['MY WAY'],
    colors: [C.navy],
    shadow: C.paper,
    titleSize: 200,
    tagline: 'Ton parcours,\nta trajectoire.',
    bg: [mix(C.sky, C.paper, 0.45), mix(C.lime, C.paper, 0.35)],
    ink: C.navy,
    accent: C.blue,
    tagBg: C.pink,
    tagFg: '#ffffff',
    art: artMyWay,
  },
  spark: {
    title: 'Spark',
    shape: 'portrait',
    kicker: 'Innovation · Idées',
    lines: ['SPARK'],
    colors: [C.sun],
    shadow: C.pink,
    titleSize: 210,
    tagline: 'Une idée ?\nAllume la mèche.',
    bg: [mix(C.navy, C.blue, 0.35), mix(C.navy, '#000000', 0.15)],
    ink: C.sun,
    accent: C.sun,
    tagBg: C.sun,
    tagFg: C.navy,
    art: artSpark,
  },
  gofluent: {
    title: 'goFLUENT',
    shape: 'portrait',
    kicker: 'Langues · E-learning',
    lines: ['goFLUENT'],
    colors: [C.paper],
    shadow: C.navy,
    titleSize: 170,
    tagline: 'Let’s talk, ¿hablamos?,\nparliamo !',
    bg: [C.pink, mix(C.pink, C.blue, 0.5)],
    ink: C.paper,
    accent: C.sun,
    tagBg: C.navy,
    tagFg: C.paper,
    art: artFluent,
  },
  primo: {
    title: 'PRIMO',
    shape: 'landscape',
    kicker: 'Pilotage · Indicateurs',
    lines: ['PRIMO'],
    colors: [C.lime],
    shadow: C.navy,
    titleSize: 170,
    tagline: 'Consulté\nsans modération.',
    bg: [C.blue, mix(C.blue, C.navy, 0.6)],
    ink: C.paper,
    accent: C.lime,
    tagBg: C.lime,
    tagFg: C.navy,
    art: artPrimo,
    extra(ctx, x, y) {
      text(ctx, 'Le tableau de bord', x + 4, y + 56, 40, C.paper, { weight: 800, maxW: 460 });
      text(ctx, 'préféré des directeurs.', x + 4, y + 104, 40, C.sky, { weight: 800, maxW: 460 });
      return y + 104;
    },
  },
  copil: {
    title: 'Comité de pilotage',
    shape: 'landscape',
    layout: 'stack',
    kicker: 'COPIL · Gouvernance',
    lines: ['COMITÉ DE', 'PILOTAGE'],
    colors: [C.navy, C.blue],
    shadow: C.paper,
    titleSize: 116,
    tagline: 'Décisions à l’heure. Café inclus.',
    bg: [mix(C.sun, C.paper, 0.45), mix(C.sun, C.pink, 0.15)],
    ink: C.navy,
    accent: C.pink,
    tagBg: C.navy,
    tagFg: C.sun,
    art: artCopil,
  },
  covoiturage: {
    title: 'Parking B2 · Covoiturage',
    shape: 'portrait',
    kicker: 'Parking B2',
    lines: ['COVOITURAGE'],
    colors: [C.navy],
    shadow: C.paper,
    titleSize: 150,
    tagline: 'Une place,\ndeux sourires.',
    bg: [mix(C.sky, C.paper, 0.4), C.sky],
    ink: C.navy,
    accent: C.blue,
    tagBg: C.navy,
    tagFg: C.paper,
    art: artCarpool,
  },
  'note-de-frais': {
    title: 'Déclaration des activités et des frais',
    shape: 'portrait',
    kicker: 'Chaque mois',
    lines: ['Déclaration', 'des activités', 'et des frais'],
    colors: [C.navy, C.blue, C.navy],
    shadow: mix(C.lime, '#ffffff', 0.5),
    titleSize: 100,
    tagline: 'Avant le 5,\ntout va bien.',
    bg: [C.lime, mix(C.lime, C.sky, 0.55)],
    ink: C.navy,
    accent: C.blue,
    tagBg: C.navy,
    tagFg: C.lime,
    art: artExpenses,
  },
  'inetum-et-moi': {
    title: 'Inetum & moi',
    shape: 'portrait',
    kicker: 'Appli · Portail salarié',
    lines: ['INETUM', '& MOI'],
    colors: [C.paper, C.sun],
    shadow: C.navy,
    tagline: 'Mes infos, mes congés,\nmon café (presque).',
    bg: [C.blue, mix(C.blue, C.pink, 0.45)],
    ink: C.paper,
    accent: C.sun,
    tagBg: C.sun,
    tagFg: C.navy,
    art: artMe,
  },
  'adopt-tools': {
    title: 'Adopt’ Tools',
    shape: 'portrait',
    kicker: 'Boîte à outils',
    lines: ['ADOPT’', 'TOOLS'],
    colors: [C.navy, C.pink],
    shadow: C.paper,
    tagline: 'Un outil, ça s’adopte.\nEt ça se partage.',
    bg: [mix(C.sky, C.paper, 0.5), mix(C.lime, C.paper, 0.4)],
    ink: C.navy,
    accent: C.blue,
    tagBg: C.navy,
    tagFg: C.lime,
    art: artAdopt,
  },
  'gen-ai-hub': {
    title: 'Gen AI Hub',
    shape: 'landscape',
    kicker: 'Intelligence artificielle',
    lines: ['GEN AI', 'HUB'],
    colors: [C.paper, C.sky],
    shadow: C.pink,
    titleSize: 150,
    tagline: 'L’IA, en équipe\net en confiance.',
    bg: [C.navy, mix(C.navy, C.blue, 0.7)],
    ink: C.sky,
    accent: C.sky,
    tagBg: C.sky,
    tagFg: C.navy,
    art: artAiHub,
  },
  annuaire: {
    title: 'Annuaire',
    shape: 'portrait',
    kicker: 'Collègues · Contacts',
    lines: ['ANNUAIRE'],
    colors: [C.navy],
    shadow: C.paper,
    titleSize: 170,
    tagline: 'Retrouver un collègue ?\nUn clic.',
    bg: [mix(C.sun, C.paper, 0.5), mix(C.sun, C.pink, 0.2)],
    ink: C.navy,
    accent: C.pink,
    tagBg: C.navy,
    tagFg: C.sun,
    art: artDirectory,
  },
  'celine-dion': {
    title: 'Céline Dion · Billetterie CSE',
    shape: 'portrait',
    kicker: 'Billetterie CSE · Concert',
    lines: ['Céline', 'Dion'],
    colors: [GOLD],
    shadow: C.pink,
    titleSize: 165,
    tagline: 'Places limitées :\nréservez vite !',
    bg: [PLUM, mix(PLUM, C.navy, 0.75)],
    ink: GOLD,
    accent: C.pink,
    tagBg: GOLD,
    tagFg: PLUM,
    art: artConcert,
    extra(ctx, x, y) {
      const cy = y + 58;
      const mid = x + 324;
      const w = measure(ctx, 'En concert', 44, 600) + 66;
      text(ctx, 'En concert', mid, cy, 44, C.paper, { weight: 600, align: 'center', spacing: 3 });
      path(ctx, [x + 10, cy - 15, mid - w / 2 - 16, cy - 15], 3, GOLD);
      path(ctx, [mid + w / 2 + 16, cy - 15, x + 638, cy - 15], 3, GOLD);
      spark(ctx, mid - w / 2 - 4, cy - 15, 9, GOLD);
      spark(ctx, mid + w / 2 + 4, cy - 15, 9, GOLD);
      return cy;
    },
  },
};

/** @type {PosterInfo[]} */
export const POSTER_LIST = Object.entries(SPECS).map(([id, s]) => ({
  id,
  title: s.title,
  shape: s.shape,
}));

/**
 * Draws a poster into a new canvas.
 * Sizes: portrait 768×1024, landscape 1024×768, banner 1536×512.
 * @param {string} id
 * @returns {HTMLCanvasElement | OffscreenCanvas}
 */
export function renderPoster(id) {
  const spec = SPECS[id];
  if (!spec) throw new Error(`Unknown poster: ${id}`);
  const [w, h] = SIZES[spec.shape];
  /** @type {HTMLCanvasElement | OffscreenCanvas} */
  let canvas;
  /** @type {Ctx | null} */
  let ctx;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    canvas = c;
    ctx = c.getContext('2d');
  } else {
    const c = new OffscreenCanvas(w, h);
    canvas = c;
    ctx = c.getContext('2d');
  }
  if (!ctx) throw new Error('2D canvas unavailable');
  if (spec.custom) spec.custom(ctx);
  else compose(ctx, spec);
  return canvas;
}
