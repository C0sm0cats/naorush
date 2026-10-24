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

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} r @param {string} c */
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
  ctx.globalAlpha = 0.3;
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
  ctx.globalAlpha = 0.5;
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
    y += fs * 0.84 + (i ? fs * 0.06 : 0);
    if (s.shadow)
      text(ctx, str, x + fs * 0.05, y + fs * 0.05, fs, s.shadow, { align, spacing: -1 });
    text(ctx, str, x, y, fs, s.colors[Math.min(i, s.colors.length - 1)], { align, spacing: -1 });
  }
  return y;
}

/** @param {Ctx} ctx @param {string} str @param {number} x @param {number} y @param {number} size @param {string} c @param {CanvasTextAlign} [align] */
function kicker(ctx, str, x, y, size, c, align = 'left') {
  text(ctx, str.toUpperCase(), x, y, size, c, { weight: 800, spacing: size * 0.22, align });
}

/**
 * Rounded card with one or two tagline lines.
 * @param {Ctx} ctx @param {Spec} s @param {number} x @param {number} y top
 * @param {number} size @param {number} maxW @param {'center'|'left'} align
 * @returns {number} card height
 */
function taglineCard(ctx, s, x, y, size, maxW, align) {
  const lines = s.tagline.split('\n');
  const pad = size * 0.7;
  let fs = size;
  const widest = Math.max(...lines.map((l) => measure(ctx, l, fs, 750)));
  if (widest > maxW - pad * 2) fs *= (maxW - pad * 2) / widest;
  const tw = Math.max(...lines.map((l) => measure(ctx, l, fs, 750)));
  const lh = fs * 1.25;
  const w = tw + pad * 2;
  const h = lh * lines.length + pad * 1.1;
  const left = align === 'center' ? x - w / 2 : x;
  box(ctx, left, y, w, h, Math.min(28, h / 2), s.tagBg);
  lines.forEach((l, i) => {
    text(ctx, l, left + w / 2, y + pad * 0.55 + lh * (i + 0.78), fs, s.tagFg, {
      weight: 750,
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
    let y = 64;
    if (s.kicker) {
      kicker(ctx, s.kicker, M + 4, y + 26, 26, s.ink);
      y += 36;
    }
    y = titleBlock(ctx, s, M, y, W - 2 * M, s.titleSize ?? 150);
    if (s.extra) y = s.extra(ctx, M, y);
    const tagTop = 832;
    if (s.art) placeArt(ctx, s.art, M - 10, y + 26, W - 2 * M + 20, tagTop - y - 48);
    taglineCard(ctx, s, W / 2, tagTop, 36, W - 2 * M, 'center');
    footer(ctx, W / 2, H - 34, 26, s.ink, 'center');
  } else if (s.shape === 'landscape' && s.layout === 'stack') {
    const M = 64;
    let y = 50;
    if (s.kicker) {
      kicker(ctx, s.kicker, W / 2, y + 26, 26, s.ink, 'center');
      y += 34;
    }
    y = titleBlock(ctx, s, W / 2, y, W - 2 * M, s.titleSize ?? 150, 'center');
    if (s.extra) y = s.extra(ctx, W / 2, y);
    const tagTop = 606;
    if (s.art) placeArt(ctx, s.art, M, y + 20, W - 2 * M, tagTop - y - 36);
    taglineCard(ctx, s, W / 2, tagTop, 32, W - 2 * M, 'center');
    footer(ctx, W / 2, H - 30, 24, s.ink, 'center');
  } else if (s.shape === 'landscape') {
    const M = 64;
    const colW = 470;
    let y = 70;
    if (s.kicker) {
      kicker(ctx, s.kicker, M + 3, y + 26, 26, s.ink);
      y += 36;
    }
    y = titleBlock(ctx, s, M, y, colW, s.titleSize ?? 140);
    if (s.extra) y = s.extra(ctx, M, y);
    if (s.art) placeArt(ctx, s.art, 560, 50, 420, 640);
    taglineCard(ctx, s, M, Math.max(y + 36, 560), 32, colW, 'left');
    footer(ctx, M, H - 40, 24, s.ink);
  } else {
    const X = 500;
    const maxW = W - X - 70;
    if (s.art) placeArt(ctx, s.art, 40, 36, 420, H - 72);
    let y = 70;
    if (s.kicker) {
      kicker(ctx, s.kicker, X + 4, y + 30, 30, s.ink);
      y += 42;
    }
    y = titleBlock(ctx, s, X, y, maxW, s.titleSize ?? 160);
    taglineCard(ctx, s, X, y + 34, 36, maxW, 'left');
    footer(ctx, W - 70, H - 38, 26, s.ink, 'right');
  }
}

// ---------------------------------------------------------------- illustrations

/** @type {Art} */
const artLearning = {
  w: 620,
  h: 440,
  draw(ctx) {
    // Books
    box(ctx, 20, 380, 170, 40, 10, C.pink);
    box(ctx, 34, 344, 150, 38, 10, C.sky);
    box(ctx, 26, 310, 160, 36, 10, C.sun);
    box(ctx, 34, 390, 140, 6, 3, mix(C.pink, '#ffffff', 0.5));
    box(ctx, 46, 354, 120, 6, 3, mix(C.sky, '#ffffff', 0.5));
    // Stairs
    const sw = 84;
    const sh = 62;
    for (let i = 0; i < 5; i++) {
      const x = 200 + i * sw;
      const top = 420 - (i + 1) * sh;
      box(
        ctx,
        x,
        top,
        sw + 2,
        420 - top,
        [12, 12, 0, 0],
        i % 2 ? C.blue : mix(C.blue, C.navy, 0.3),
      );
      box(ctx, x, top, sw + 2, 12, [12, 12, 0, 0], C.sky);
    }
    const labels = ['Skills', 'Career', 'Talents'];
    labels.forEach((l, i) => {
      text(ctx, l, 200 + (i + 1) * sw + sw / 2, 420 - (i + 1) * sh + 48, 17, C.paper, {
        weight: 800,
        align: 'center',
      });
    });
    person(ctx, 285, 358, 0.62, {
      skin: SKIN[1],
      hair: HAIR[1],
      shirt: C.pink,
      pants: C.navy,
      wave: true,
    });
    // Mortarboard above the top step.
    const cx = 496;
    const cy = 60;
    poly(ctx, [cx - 66, cy + 20, cx + 66, cy + 20, cx + 56, cy + 74, cx - 56, cy + 74], C.navy);
    poly(ctx, [cx - 120, cy, cx, cy - 46, cx + 120, cy, cx, cy + 46], C.navy);
    poly(ctx, [cx - 104, cy, cx, cy - 38, cx + 104, cy, cx, cy + 38], mix(C.navy, C.blue, 0.6));
    path(ctx, [cx, cy, cx + 84, cy + 14, cx + 90, cy + 74], 6, C.sun);
    circle(ctx, cx, cy, 9, C.sun);
    box(ctx, cx + 80, cy + 70, 20, 30, 6, C.sun);
    spark(ctx, cx - 140, cy + 70, 18, C.paper);
    spark(ctx, cx - 100, cy - 40, 12, C.navy);
  },
};

/** @type {Art} */
const artChrono = {
  w: 620,
  h: 440,
  draw(ctx) {
    const cx = 430;
    const cy = 230;
    // Alarm bells and feet.
    circle(ctx, cx - 120, cy - 150, 46, C.sun);
    circle(ctx, cx + 120, cy - 150, 46, C.sun);
    path(ctx, [cx - 110, cy + 150, cx - 140, cy + 196], 18, C.sun);
    path(ctx, [cx + 110, cy + 150, cx + 140, cy + 196], 18, C.sun);
    circle(ctx, cx, cy, 186, C.sun);
    circle(ctx, cx, cy, 154, C.paper);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU;
      const big = i % 5 === 0;
      const r0 = big ? 122 : 136;
      path(
        ctx,
        [
          cx + Math.cos(a) * r0,
          cy + Math.sin(a) * r0,
          cx + Math.cos(a) * 144,
          cy + Math.sin(a) * 144,
        ],
        big ? 9 : 3,
        big ? C.navy : mix(C.navy, C.paper, 0.6),
      );
    }
    // 9:00 sharp.
    path(ctx, [cx, cy, cx - 78, cy], 16, C.navy);
    path(ctx, [cx, cy, cx, cy - 110], 11, C.navy);
    path(ctx, [cx, cy + 30, cx + 70, cy - 90], 4, C.pink);
    circle(ctx, cx, cy, 16, C.pink);
    // Badge reader.
    box(ctx, 26, 120, 190, 300, 30, C.blue);
    box(ctx, 26, 120, 190, 22, [30, 30, 0, 0], mix(C.blue, C.sky, 0.3));
    box(ctx, 48, 156, 146, 80, 14, C.navy);
    text(ctx, '08:59', 121, 213, 44, C.lime, { align: 'center', weight: 800 });
    for (let i = 0; i < 3; i++) arc(ctx, 121, 330, 26 + i * 22, 8, C.sky, -2.4, -0.74);
    circle(ctx, 121, 330, 10, C.sky);
    circle(ctx, 180, 392, 9, C.lime);
    // Badge on its lanyard, tapping the reader.
    at(ctx, 196, 344, 0.22, () => {
      ctx.scale(0.8, 0.8);
      path(ctx, [0, -70, -30, -150], 10, C.pink);
      path(ctx, [0, -70, 34, -150], 10, C.pink);
      box(ctx, -58, -72, 116, 156, 16, C.paper);
      box(ctx, -58, -72, 116, 34, [16, 16, 0, 0], C.pink);
      circle(ctx, 0, 8, 26, SKIN[2]);
      ctx.beginPath();
      ctx.arc(0, 4, 27, Math.PI, 0);
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
    // Friendly face wearing a headset.
    circle(ctx, cx, cy + 10, 132, C.paper);
    circle(ctx, cx - 44, cy - 4, 13, C.navy);
    circle(ctx, cx + 44, cy - 4, 13, C.navy);
    arc(ctx, cx, cy + 34, 46, 12, C.navy, 0.15 * Math.PI, 0.85 * Math.PI);
    circle(ctx, cx - 82, cy + 40, 16, mix(C.pink, C.paper, 0.4));
    circle(ctx, cx + 82, cy + 40, 16, mix(C.pink, C.paper, 0.4));
    arc(ctx, cx, cy + 10, 160, 30, C.navy, Math.PI * 1.03, Math.PI * 1.97);
    box(ctx, cx - 192, cy - 40, 64, 116, 28, C.pink);
    box(ctx, cx + 128, cy - 40, 64, 116, 28, C.pink);
    ctx.beginPath();
    ctx.moveTo(cx - 160, cy + 70);
    ctx.quadraticCurveTo(cx - 150, cy + 150, cx - 40, cy + 140);
    ctx.lineWidth = 14;
    ctx.strokeStyle = C.navy;
    ctx.lineCap = 'round';
    ctx.stroke();
    box(ctx, cx - 56, cy + 124, 44, 32, 16, C.lime);
    // Speech waves.
    arc(ctx, cx + 120, cy - 150, 26, 9, C.paper, -1.2, 0.2);
    arc(ctx, cx + 120, cy - 150, 52, 9, C.paper, -1.2, 0.2);
    // Ticket.
    at(ctx, cx, 470, -0.06, () => {
      box(ctx, -190, -90, 380, 180, 24, C.navy);
      circle(ctx, -190, 0, 26, C.sky);
      circle(ctx, 190, 0, 26, C.sky);
      path(ctx, [72, -70, 72, 70], 4, mix(C.navy, C.sky, 0.5), [10, 10]);
      text(ctx, 'TICKET #4242', -150, -34, 28, C.sky, { weight: 800 });
      box(ctx, -150, -10, 170, 12, 6, mix(C.navy, C.paper, 0.35));
      box(ctx, -150, 16, 120, 12, 6, mix(C.navy, C.paper, 0.35));
      box(ctx, -152, 42, 150, 36, 18, C.lime);
      text(ctx, 'RÉSOLU', -77, 70, 24, C.navy, { align: 'center', weight: 900 });
      circle(ctx, 130, 0, 38, C.lime);
      check(ctx, 130, 2, 18, 9, C.navy);
    });
  },
};

/** @type {Art} */
const artConcur = {
  w: 620,
  h: 440,
  draw(ctx) {
    // Dashed flight path from the receipt to the plane.
    ctx.beginPath();
    ctx.moveTo(250, 120);
    ctx.bezierCurveTo(330, 30, 420, 160, 500, 80);
    ctx.setLineDash([14, 14]);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = mix(C.sky, C.blue, 0.3);
    ctx.stroke();
    ctx.setLineDash([]);
    // Suitcase.
    box(ctx, 420, 262, 70, 40, 16, C.navy);
    box(ctx, 436, 276, 38, 30, 8, mix(C.blue, C.navy, 0.2));
    box(ctx, 360, 290, 190, 140, 24, C.pink);
    box(ctx, 400, 290, 16, 140, 0, mix(C.pink, C.navy, 0.2));
    box(ctx, 494, 290, 16, 140, 0, mix(C.pink, C.navy, 0.2));
    circle(ctx, 455, 360, 18, C.sun);
    // Receipt.
    at(ctx, 160, 222, -0.08, () => {
      ctx.beginPath();
      ctx.moveTo(-120, -200);
      ctx.lineTo(120, -200);
      ctx.lineTo(120, 190);
      for (let i = 0; i < 8; i++) {
        ctx.lineTo(120 - (i + 0.5) * 30, 210);
        ctx.lineTo(120 - (i + 1) * 30, 190);
      }
      ctx.closePath();
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
    circle(ctx, 268, 52, 36, C.lime);
    check(ctx, 268, 54, 16, 9, C.navy);
    // Plane.
    at(ctx, 520, 90, -0.45, () => {
      poly(ctx, [-10, -6, 30, -6, -20, -90, -44, -90], mix(C.sky, C.paper, 0.4));
      poly(ctx, [-10, 6, 30, 6, -20, 90, -44, 90], mix(C.sky, C.blue, 0.2));
      box(ctx, -90, -18, 190, 36, 18, C.paper);
      poly(ctx, [-90, -4, -70, -4, -88, -44, -104, -44], mix(C.sky, C.blue, 0.2));
      for (let i = 0; i < 4; i++) circle(ctx, -40 + i * 26, -2, 6, C.sky);
    });
  },
};

/** @type {Art} */
const artPeopleDoc = {
  w: 620,
  h: 440,
  draw(ctx) {
    const back = mix(C.blue, C.sky, 0.35);
    box(ctx, 100, 70, 160, 60, 18, back);
    box(ctx, 100, 100, 420, 320, 24, back);
    // Payslip and a second document.
    at(ctx, 340, 210, 0.07, () => box(ctx, -150, -170, 290, 300, 14, mix(C.paper, C.sky, 0.25)));
    at(ctx, 300, 200, -0.05, () => {
      box(ctx, -150, -170, 300, 320, 14, C.paper);
      text(ctx, 'BULLETIN DE PAIE', -122, -124, 24, C.blue, { weight: 900 });
      for (let i = 0; i < 4; i++) {
        box(ctx, -122, -96 + i * 30, 150 - (i % 2) * 40, 11, 5, mix(C.navy, C.paper, 0.65));
        box(ctx, 66, -96 + i * 30, 56, 11, 5, mix(C.navy, C.paper, 0.5));
      }
    });
    // Folder front.
    poly(ctx, [80, 220, 540, 220, 520, 420, 100, 420], C.sky);
    poly(ctx, [80, 220, 540, 220, 536, 250, 84, 250], mix(C.sky, '#ffffff', 0.35));
    text(ctx, 'DOCUMENTS RH', 276, 350, 38, C.navy, { align: 'center' });
    // Shield with a padlock.
    const sx = 540;
    const sy = 330;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 80);
    ctx.quadraticCurveTo(sx + 40, sy - 60, sx + 70, sy - 64);
    ctx.quadraticCurveTo(sx + 76, sy + 40, sx, sy + 86);
    ctx.quadraticCurveTo(sx - 76, sy + 40, sx - 70, sy - 64);
    ctx.quadraticCurveTo(sx - 40, sy - 60, sx, sy - 80);
    ctx.fillStyle = C.lime;
    ctx.fill();
    arc(ctx, sx, sy - 6, 20, 9, C.navy, Math.PI, 0);
    box(ctx, sx - 32, sy - 8, 64, 50, 10, C.navy);
    circle(ctx, sx, sy + 14, 7, C.lime);
    spark(ctx, 70, 160, 20, C.pink);
    spark(ctx, 580, 120, 14, C.blue);
  },
};

/** @type {Art} */
const artSwile = {
  w: 620,
  h: 440,
  draw(ctx) {
    const cx = 300;
    const cy = 210;
    // Fork and knife.
    box(ctx, 64, 60, 18, 330, 9, C.paper);
    for (let i = 0; i < 4; i++) box(ctx, 44 + i * 16, 50, 9, 90, 5, C.paper);
    box(ctx, 44, 120, 57, 40, 14, C.paper);
    ctx.beginPath();
    ctx.moveTo(526, 390);
    ctx.lineTo(526, 50);
    ctx.quadraticCurveTo(570, 90, 560, 240);
    ctx.lineTo(546, 250);
    ctx.lineTo(546, 390);
    ctx.closePath();
    ctx.fillStyle = C.paper;
    ctx.fill();
    // Plate seen from above.
    circle(ctx, cx + 8, cy + 10, 182, mix(C.pink, C.navy, 0.25));
    circle(ctx, cx, cy, 182, C.paper);
    circle(ctx, cx, cy, 140, mix(C.paper, C.pink, 0.12));
    // Bowl: greens, tomatoes, an egg.
    const r = rng(7);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      at(ctx, cx - 30 + Math.cos(a) * 60, cy + 10 + Math.sin(a) * 50, a, () => {
        ctx.beginPath();
        ctx.ellipse(0, 0, 44, 22, 0, 0, TAU);
        ctx.fillStyle = i % 2 ? C.lime : mix(C.lime, '#3c8c3c', 0.45);
        ctx.fill();
      });
    }
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU;
      circle(ctx, cx - 30 + Math.cos(a) * 64, cy + 10 + Math.sin(a) * 56, 18, C.pink);
      circle(
        ctx,
        cx - 34 + Math.cos(a) * 64,
        cy + 6 + Math.sin(a) * 56,
        5,
        mix(C.pink, '#ffffff', 0.6),
      );
    }
    ctx.beginPath();
    ctx.ellipse(cx + 70, cy - 40, 54, 44, 0.3, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    circle(ctx, cx + 74, cy - 38, 22, C.sun);
    // Meal card.
    at(ctx, 470, 360, -0.16, () => {
      box(ctx, -110, -70, 220, 140, 18, C.navy);
      box(ctx, -86, -40, 48, 36, 8, C.sun);
      text(ctx, 'Bon appétit', -86, 46, 26, C.paper, { weight: 800 });
      heart(ctx, 74, -24, 18, C.pink);
    });
  },
};

/** @type {Art} */
const artOrder = {
  w: 620,
  h: 440,
  draw(ctx) {
    box(ctx, 120, 20, 380, 420, 28, C.blue);
    box(ctx, 146, 52, 328, 370, 12, '#ffffff');
    box(ctx, 230, 0, 160, 56, 16, C.navy);
    box(ctx, 266, 14, 88, 18, 9, C.sun);
    text(ctx, 'N° 2026-042', 176, 106, 26, C.blue, { weight: 900 });
    const rows = ['Projet', 'Fournisseur', 'Montant'];
    rows.forEach((l, i) => {
      const y = 150 + i * 62;
      box(ctx, 176, y, 34, 34, 8, mix(C.lime, '#ffffff', 0.2));
      check(ctx, 193, y + 18, 10, 6, C.navy);
      text(ctx, l, 224, y + 26, 24, C.navy, { weight: 800 });
      path(ctx, [400, y + 26, 446, y + 26], 4, mix(C.navy, '#ffffff', 0.7));
    });
    // Rubber stamp.
    at(ctx, 320, 326, -0.18, () => {
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.roundRect(-214, -56, 428, 112, 18);
      ctx.lineWidth = 10;
      ctx.strokeStyle = C.pink;
      ctx.stroke();
      text(ctx, 'APPROUVÉ', 0, 24, 64, C.pink, { align: 'center', spacing: 2, maxW: 390 });
      ctx.globalAlpha = 1;
    });
    // Pen.
    at(ctx, 540, 180, 0.5, () => {
      box(ctx, -14, -150, 28, 220, 12, C.pink);
      box(ctx, -14, -150, 28, 46, [12, 12, 0, 0], C.navy);
      poly(ctx, [-14, 70, 14, 70, 0, 104], C.sun);
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
    panels.forEach((p, i) => poly(ctx, p, i % 2 ? mix(C.paper, C.sky, 0.25) : C.paper));
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
    ctx.strokeStyle = C.sky;
    ctx.stroke();
    poly(ctx, [420, 210, 500, 90, 580, 210], mix(C.blue, C.sky, 0.3));
    poly(ctx, [480, 120, 500, 90, 520, 120, 500, 130], '#ffffff');
    circle(ctx, 150, 330, 40, mix(C.lime, '#3c8c3c', 0.3));
    circle(ctx, 200, 350, 30, mix(C.lime, '#3c8c3c', 0.5));
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
    circle(ctx, 130, 120, 16, C.navy);
    pin(ctx, 500, 200, 36, C.pink, C.paper);
    // Suitcase in front.
    box(ctx, 34, 260, 80, 40, 16, C.navy);
    box(ctx, 48, 274, 52, 30, 8, C.sun);
    box(ctx, 0, 290, 150, 140, 22, C.blue);
    box(ctx, 26, 290, 14, 140, 0, mix(C.blue, C.navy, 0.4));
    box(ctx, 110, 290, 14, 140, 0, mix(C.blue, C.navy, 0.4));
    circle(ctx, 75, 360, 22, C.lime);
    check(ctx, 75, 362, 10, 6, C.navy);
  },
};

/** @type {Art} */
const artSuccess = {
  w: 620,
  h: 460,
  draw(ctx) {
    const steps = [
      { x: 50, h: 120, c: C.sky, n: '2' },
      { x: 220, h: 190, c: C.lime, n: '1' },
      { x: 390, h: 90, c: C.paper, n: '3' },
    ];
    for (const s of steps) {
      box(ctx, s.x, 460 - s.h, 170, s.h, [16, 16, 0, 0], s.c);
      box(ctx, s.x, 460 - s.h, 170, 14, [16, 16, 0, 0], mix(s.c, '#ffffff', 0.4));
      text(ctx, s.n, s.x + 85, 460 - s.h + 76, 60, C.navy, { align: 'center' });
    }
    person(ctx, 135, 340, 0.62, {
      skin: SKIN[3],
      hair: HAIR[0],
      shirt: C.pink,
      pants: C.navy,
      wave: true,
    });
    person(ctx, 305, 270, 0.7, {
      skin: SKIN[0],
      hair: HAIR[3],
      shirt: C.sun,
      pants: C.navy,
      cheer: true,
    });
    person(ctx, 475, 370, 0.58, {
      skin: SKIN[2],
      hair: HAIR[1],
      shirt: C.sky,
      pants: C.navy,
      wave: true,
    });
    // Target with an arrow.
    const tx = 520;
    const ty = 100;
    circle(ctx, tx, ty, 78, C.paper);
    circle(ctx, tx, ty, 58, C.pink);
    circle(ctx, tx, ty, 38, C.paper);
    circle(ctx, tx, ty, 18, C.pink);
    path(ctx, [tx - 110, ty + 70, tx - 4, ty + 4], 10, C.navy);
    poly(ctx, [tx - 110, ty + 70, tx - 140, ty + 64, tx - 128, ty + 92], C.sun);
    spark(ctx, 120, 60, 22, C.paper);
    spark(ctx, 200, 120, 12, C.lime);
  },
};

/** @type {Art} */
const artComp = {
  w: 620,
  h: 440,
  draw(ctx) {
    const cx = 310;
    poly(ctx, [cx - 90, 440, cx + 90, 440, cx + 50, 400, cx - 50, 400], C.paper);
    box(ctx, cx - 12, 90, 24, 320, 10, C.paper);
    circle(ctx, cx, 84, 26, C.lime);
    box(ctx, cx - 230, 110, 460, 20, 10, C.paper);
    for (const side of [-1, 1]) {
      const px = cx + side * 200;
      path(ctx, [px, 120, px - 80, 280], 4, mix(C.paper, C.sky, 0.3));
      path(ctx, [px, 120, px + 80, 280], 4, mix(C.paper, C.sky, 0.3));
      circle(ctx, px, 120, 12, C.lime);
      ctx.beginPath();
      ctx.moveTo(px - 104, 280);
      ctx.lineTo(px + 104, 280);
      ctx.quadraticCurveTo(px + 90, 340, px, 340);
      ctx.quadraticCurveTo(px - 90, 340, px - 104, 280);
      ctx.fillStyle = C.lime;
      ctx.fill();
    }
    // Left pan: a stack of coins.
    for (let i = 0; i < 5; i++) {
      const y = 262 - i * 22;
      box(ctx, cx - 260, y, 120, 22, 8, i % 2 ? C.sun : mix(C.sun, '#e0a030', 0.4));
    }
    circle(ctx, cx - 200, 150, 40, C.sun);
    ring(ctx, cx - 200, 150, 30, 5, mix(C.sun, '#e0a030', 0.6));
    text(ctx, '€', cx - 200, 166, 42, mix(C.sun, '#a0661a', 0.7), { align: 'center' });
    // Right pan: a star for the work done.
    starShape(ctx, cx + 200, 210, 70, 32, C.pink);
    spark(ctx, cx + 120, 30, 18, C.lime);
    spark(ctx, cx - 120, 50, 12, C.sky);
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
    // Sun + rays + bolt.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      path(
        ctx,
        [
          cx + Math.cos(a) * 168,
          220 + Math.sin(a) * 168,
          cx + Math.cos(a) * 205,
          220 + Math.sin(a) * 205,
        ],
        14,
        C.sun,
      );
    }
    circle(ctx, cx, 220, 150, C.sun);
    circle(ctx, cx, 220, 122, mix(C.sun, '#ffffff', 0.35));
    bolt(ctx, cx + 6, 226, 112, C.navy);
    bolt(ctx, cx, 220, 112, C.lime);
    // Mountain with a flag.
    poly(ctx, [-10, 620, 210, 390, 450, 620], C.navy);
    poly(ctx, [210, 390, 260, 442, 236, 436, 214, 456, 190, 436, 168, 434], C.paper);
    path(ctx, [210, 392, 210, 300], 8, C.paper);
    poly(ctx, [214, 300, 290, 318, 214, 340], C.lime);
  },
};

/** @type {Art} */
const artTour = {
  w: 420,
  h: 440,
  draw(ctx) {
    const cx = 210;
    const cy = 220;
    circle(ctx, cx, cy, 200, C.blue);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 200, 0, TAU);
    ctx.clip();
    circle(ctx, cx + 70, cy - 30, 58, C.sun);
    poly(ctx, [0, 300, 120, 200, 220, 300], mix(C.blue, C.navy, 0.45));
    poly(ctx, [160, 300, 300, 170, 440, 300], mix(C.blue, C.navy, 0.3));
    ctx.fillStyle = mix(C.lime, '#2e7d32', 0.45);
    ctx.fillRect(0, 290, 440, 200);
    poly(ctx, [cx - 16, 290, cx + 16, 290, cx + 150, 440, cx - 150, 440], C.navy);
    for (let i = 0; i < 4; i++) {
      const t0 = i / 4;
      const y0 = 300 + t0 * t0 * 140 + i * 10;
      const h = 14 + i * 10;
      poly(
        ctx,
        [cx - 3 - i * 2, y0, cx + 3 + i * 2, y0, cx + 4 + i * 3, y0 + h, cx - 4 - i * 3, y0 + h],
        C.lime,
      );
    }
    ctx.restore();
    ring(ctx, cx, cy, 200, 14, C.lime);
    pin(ctx, cx - 60, 250, 54, C.pink, C.pink);
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
      FRANCE.map((v, i) => (i % 2 ? oy + 10 + v * sh : ox + 12 + v * sw)),
      mix(C.blue, C.navy, 0.2),
    );
    poly(
      ctx,
      FRANCE.map((v, i) => (i % 2 ? oy + v * sh : ox + v * sw)),
      C.sky,
    );
    ctx.beginPath();
    ctx.ellipse(ox + 1.0 * sw, oy + 0.92 * sh, 14, 26, 0.2, 0, TAU);
    ctx.fillStyle = C.sky;
    ctx.fill();
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
    pts.forEach(([x, y], i) => {
      circle(ctx, x, y, i === 0 ? 26 : 15, C.paper);
      circle(ctx, x, y, i === 0 ? 17 : 9, i === 0 ? C.pink : C.blue);
    });
    // Speech bubbles.
    /** @param {number} x @param {number} y @param {string} t @param {string} bg @param {string} fg @param {number} dir */
    const bubble = (x, y, t, bg, fg, dir) => {
      const w = measure(ctx, t, 40, 900) + 48;
      box(ctx, x, y, w, 78, 39, bg);
      poly(
        ctx,
        [x + w / 2 - 14, y + 74, x + w / 2 + 14, y + 74, x + w / 2 + dir * 30, y + 106],
        bg,
      );
      text(ctx, t, x + w / 2, y + 54, 40, fg, { align: 'center' });
    };
    bubble(0, 150, 'Salut !', C.pink, '#ffffff', 1);
    bubble(450, 330, 'Hello !', C.blue, '#ffffff', -1);
    bubble(30, 340, 'On s’aide ?', C.sun, C.navy, 1);
  },
};

/** @type {Art} */
const artGenAi = {
  w: 620,
  h: 440,
  draw(ctx) {
    const cx = 260;
    const cy = 260;
    // Antenna.
    path(ctx, [cx, cy - 150, cx, cy - 210], 10, C.paper);
    circle(ctx, cx, cy - 216, 34, mix(C.pink, C.navy, 0.6));
    circle(ctx, cx, cy - 216, 22, C.pink);
    // Ears and head.
    box(ctx, cx - 196, cy - 50, 40, 100, 18, C.pink);
    box(ctx, cx + 156, cy - 50, 40, 100, 18, C.pink);
    box(ctx, cx - 170, cy - 150, 340, 280, 60, C.paper);
    box(ctx, cx - 136, cy - 112, 272, 190, 40, C.navy);
    arc(ctx, cx - 58, cy - 10, 26, 13, C.sky, Math.PI * 1.1, Math.PI * 1.9);
    arc(ctx, cx + 58, cy - 10, 26, 13, C.sky, Math.PI * 1.1, Math.PI * 1.9);
    arc(ctx, cx, cy + 14, 30, 11, C.pink, 0.2 * Math.PI, 0.8 * Math.PI);
    circle(ctx, cx - 100, cy + 30, 12, mix(C.pink, C.navy, 0.5));
    circle(ctx, cx + 100, cy + 30, 12, mix(C.pink, C.navy, 0.5));
    box(ctx, cx - 80, cy + 130, 160, 40, [0, 0, 20, 20], mix(C.paper, C.sky, 0.4));
    // Speech bubble.
    box(ctx, 420, 30, 200, 96, 32, C.sky);
    poly(ctx, [440, 110, 480, 110, 420, 160], C.sky);
    text(ctx, 'Bonjour !', 520, 92, 36, C.navy, { align: 'center' });
    spark(ctx, 480, 220, 30, C.lime);
    spark(ctx, 560, 290, 18, C.pink);
    spark(ctx, 40, 70, 22, C.sky);
  },
};

/** @type {Art} */
const artCharity = {
  w: 620,
  h: 460,
  draw(ctx) {
    const cx = 310;
    const cy = 170;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      path(
        ctx,
        [
          cx + Math.cos(a) * 170,
          cy + Math.sin(a) * 160,
          cx + Math.cos(a) * 205,
          cy + Math.sin(a) * 195,
        ],
        12,
        i % 2 ? C.sun : mix(C.pink, '#ffffff', 0.3),
      );
    }
    heart(ctx, cx + 8, cy + 10, 150, mix(C.pink, C.navy, 0.3));
    heart(ctx, cx, cy, 150, C.pink);
    ctx.beginPath();
    ctx.ellipse(cx - 80, cy - 50, 26, 16, -0.7, 0, TAU);
    ctx.fillStyle = mix(C.pink, '#ffffff', 0.55);
    ctx.fill();
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
    box(ctx, 120, 20, 230, 230, 40, C.sky);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(120, 20, 230, 230, 40);
    ctx.clip();
    circle(ctx, 235, 300, 110, C.blue);
    ctx.restore();
    circle(ctx, 235, 120, 50, SKIN[1]);
    ctx.beginPath();
    ctx.arc(235, 112, 52, Math.PI * 1.02, Math.PI * 1.98);
    ctx.fillStyle = HAIR[1];
    ctx.fill();
    starShape(ctx, 330, 34, 36, 16, C.sun);
    text(ctx, '1 TALENT', 235, 300, 48, C.paper, { align: 'center' });
    // Equals.
    box(ctx, 400, 100, 90, 24, 12, C.sun);
    box(ctx, 400, 150, 90, 24, 12, C.sun);
    // Gift.
    box(ctx, 540, 100, 220, 150, 18, C.pink);
    box(ctx, 524, 70, 252, 50, 14, mix(C.pink, '#ffffff', 0.2));
    box(ctx, 634, 70, 32, 180, 0, C.sun);
    ctx.lineWidth = 18;
    ctx.strokeStyle = C.sun;
    ctx.beginPath();
    ctx.ellipse(615, 50, 36, 22, 0.4, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(685, 50, 36, 22, -0.4, 0, TAU);
    ctx.stroke();
    circle(ctx, 650, 66, 16, C.sun);
    text(ctx, '1 PRIME', 650, 300, 48, C.paper, { align: 'center' });
    spark(ctx, 820, 60, 22, C.sun);
    spark(ctx, 60, 200, 18, C.pink);
  },
};

/** @type {Art} */
const artVip = {
  w: 420,
  h: 440,
  draw(ctx) {
    // Crown.
    const cx = 210;
    poly(ctx, [70, 200, 60, 60, 140, 130, 210, 30, 280, 130, 360, 60, 350, 200], C.sun);
    box(ctx, 66, 190, 288, 44, 12, mix(C.sun, '#e0a030', 0.45));
    circle(ctx, 60, 60, 18, C.sun);
    circle(ctx, 210, 30, 20, C.sun);
    circle(ctx, 360, 60, 18, C.sun);
    circle(ctx, cx, 212, 14, C.pink);
    circle(ctx, cx - 90, 212, 10, C.sky);
    circle(ctx, cx + 90, 212, 10, C.sky);
    // Stanchions and velvet rope.
    for (const x of [50, 370]) {
      box(ctx, x - 9, 300, 18, 120, 6, C.sun);
      ctx.beginPath();
      ctx.ellipse(x, 424, 46, 14, 0, 0, TAU);
      ctx.fillStyle = C.sun;
      ctx.fill();
      circle(ctx, x, 296, 18, C.sun);
    }
    ctx.beginPath();
    ctx.moveTo(50, 316);
    ctx.quadraticCurveTo(210, 420, 370, 316);
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.pink;
    ctx.stroke();
    spark(ctx, 380, 250, 18, C.paper);
    spark(ctx, 30, 160, 14, C.paper);
  },
};

/** @type {Art} */
const artSummer = {
  w: 620,
  h: 460,
  draw(ctx) {
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
      box(ctx, x - 5, y, 10, 10, 2, C.navy);
      circle(ctx, x, y + 20, 13, bulbs[i % 4]);
    }
    // Sun over the sea.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 620, 330);
    ctx.clip();
    circle(ctx, 300, 330, 160, C.sun);
    ctx.restore();
    for (let i = 0; i < 4; i++)
      box(ctx, 140, 260 + i * 18, 320, 6 + i * 2, 0, mix(C.pink, C.sun, 0.35));
    box(ctx, 0, 330, 620, 130, [0, 0, 24, 24], C.blue);
    for (let i = 0; i < 5; i++) {
      box(ctx, 200 + (i % 2) * 40, 350 + i * 20, 200 - i * 26, 8, 4, C.sun);
    }
    path(ctx, [30, 380, 110, 380], 6, C.sky);
    path(ctx, [480, 410, 580, 410], 6, C.sky);
    // Palm tree.
    ctx.beginPath();
    ctx.moveTo(70, 460);
    ctx.quadraticCurveTo(60, 300, 130, 170);
    ctx.lineWidth = 26;
    ctx.strokeStyle = C.navy;
    ctx.lineCap = 'round';
    ctx.stroke();
    for (const a of [-2.7, -2.1, -1.4, -0.7, -0.1]) {
      at(ctx, 130, 170, a, () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(70, -40, 140, 20);
        ctx.quadraticCurveTo(70, 0, 0, 0);
        ctx.fillStyle = C.navy;
        ctx.fill();
      });
    }
    // Cocktail.
    poly(ctx, [450, 200, 570, 200, 510, 290], mix(C.sky, '#ffffff', 0.3));
    poly(ctx, [466, 214, 554, 214, 510, 280], C.pink);
    box(ctx, 505, 285, 10, 70, 4, C.paper);
    box(ctx, 470, 350, 80, 12, 6, C.paper);
    path(ctx, [530, 214, 580, 140], 7, C.lime);
    circle(ctx, 462, 202, 20, C.lime);
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
  const sky = ctx.createLinearGradient(0, 0, 0, 520);
  sky.addColorStop(0, C.sky);
  sky.addColorStop(1, mix(C.sun, C.paper, 0.4));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  circle(ctx, 500, 470, 100, mix(C.sun, '#ffffff', 0.25));
  circle(ctx, 500, 470, 72, C.sun);
  // Clouds.
  for (const [x, y, s] of [
    [620, 110, 1],
    [930, 200, 0.7],
  ]) {
    box(ctx, x - 90 * s, y, 180 * s, 44 * s, 22 * s, '#ffffff');
    circle(ctx, x - 20 * s, y, 40 * s, '#ffffff');
    circle(ctx, x + 30 * s, y + 6 * s, 30 * s, '#ffffff');
  }
  const horizon = 520;
  // Far trees.
  const tree = mix(C.lime, '#2e7d32', 0.55);
  const tree2 = mix(C.lime, '#2e7d32', 0.3);
  for (let i = 0; i < 20; i++) circle(ctx, i * 56, horizon - 6 - (i % 3) * 10, 46, tree);
  // Building: LCP7.
  box(ctx, 620, 380, 370, 140, 8, '#ffffff');
  box(ctx, 680, 316, 240, 70, 8, mix('#ffffff', C.sky, 0.15));
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 8; c++)
      box(ctx, 636 + c * 44, 398 + r * 56, 34, 38, 4, mix(C.sky, C.blue, 0.25));
  }
  for (let c = 0; c < 5; c++) box(ctx, 696 + c * 44, 330, 38, 40, 4, mix(C.sky, C.blue, 0.4));
  box(ctx, 900, 244, 76, 76, 14, C.lime);
  text(ctx, '7', 938, 306, 66, C.navy, { align: 'center' });
  path(ctx, [938, 320, 938, 380], 8, C.navy);
  for (let i = 0; i < 10; i++) circle(ctx, 30 + i * 52, horizon - (i % 2) * 18, 38, tree2);
  for (let i = 0; i < 9; i++) circle(ctx, 600 + i * 52, horizon + 4 - (i % 2) * 14, 30, tree2);
  // The Erdre.
  const water = ctx.createLinearGradient(0, horizon, 0, H);
  water.addColorStop(0, mix(C.blue, C.sky, 0.35));
  water.addColorStop(1, C.blue);
  ctx.fillStyle = water;
  ctx.fillRect(0, horizon, W, H - horizon);
  for (let i = 0; i < 6; i++) {
    box(ctx, 500 - (90 - i * 12), horizon + 16 + i * 26, (90 - i * 12) * 2, 8, 4, C.sun);
  }
  for (let i = 0; i < 8; i++) {
    box(ctx, 660 + (i % 3) * 110, horizon + 20 + i * 18, 60, 5, 3, mix('#ffffff', C.sky, 0.3));
  }
  // Sailboat.
  poly(ctx, [160, 620, 280, 620, 260, 648, 180, 648], C.paper);
  poly(ctx, [220, 612, 220, 520, 280, 612], C.pink);
  poly(ctx, [212, 612, 212, 540, 170, 612], '#ffffff');

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
    lines: ['Comité de pilotage'],
    colors: [C.navy],
    shadow: C.paper,
    titleSize: 110,
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
