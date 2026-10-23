// Procedurally drawn office whiteboards and door plaques. Everything is generic and fictional.
// Plain Canvas 2D so it runs on an HTMLCanvasElement or an OffscreenCanvas.

/** @typedef {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} Ctx */
/** @typedef {{x: number, y: number, w: number, h: number}} Rect */
/** @typedef {'dot'|'box'|'tick'|'round'|'num'} Bullet */

const HAND =
  '"Comic Neue", "Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive';
const HEAD = '"Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
const SANS = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
const TAU = Math.PI * 2;

const K = {
  navy: '#1c2f78',
  ink: '#1f2433',
  blue: '#1f63c6',
  sky: '#2a9fd8',
  green: '#2c9a46',
  orange: '#ee8a17',
  purple: '#8448cc',
  red: '#e0312f',
  teal: '#11929e',
  gold: '#e3a90c',
  grey: '#9aa0aa',
};

const BW = 1600;
const BH = 1200;

// ---------------------------------------------------------------- canvas + colour helpers

/** @param {number} w @param {number} h @returns {{canvas: HTMLCanvasElement | OffscreenCanvas, ctx: Ctx}} */
function makeCanvas(w, h) {
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
  return { canvas, ctx };
}

/** @param {string} hex */
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** @param {string} a @param {string} b @param {number} t 0 = a, 1 = b */
function mix(a, b, t) {
  const x = rgb(a);
  const y = rgb(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** @param {string} c */
const tint = (c) => mix(c, '#ffffff', 0.9);
/** @param {string} c */
const deep = (c) => mix(c, '#101830', 0.25);

// ---------------------------------------------------------------- shape helpers

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

/**
 * @param {Ctx} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 * @param {number} lw
 * @param {string} c
 */
function frameRect(ctx, x, y, w, h, r, lw, c) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.lineWidth = lw;
  ctx.strokeStyle = c;
  ctx.stroke();
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

/** @param {Ctx} ctx @param {number[]} p flat x,y list @param {number} w @param {string} c */
function path(ctx, p, w, c) {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = c;
  ctx.stroke();
}

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} s @param {number} w @param {string} c */
function check(ctx, x, y, s, w, c) {
  path(ctx, [x - s, y, x - s * 0.3, y + s * 0.7, x + s, y - s * 0.75], w, c);
}

/** Arrow from (x0,y0) to (x1,y1) through a quadratic control point. @param {Ctx} ctx
 * @param {number[]} p x0,y0,cx,cy,x1,y1 @param {number} w @param {string} c */
function curvedArrow(ctx, p, w, c) {
  const [x0, y0, cx, cy, x1, y1] = p;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.strokeStyle = c;
  ctx.stroke();
  const a = Math.atan2(y1 - cy, x1 - cx);
  const L = w * 4;
  path(
    ctx,
    [
      x1 - Math.cos(a - 0.5) * L,
      y1 - Math.sin(a - 0.5) * L,
      x1,
      y1,
      x1 - Math.cos(a + 0.5) * L,
      y1 - Math.sin(a + 0.5) * L,
    ],
    w,
    c,
  );
}

/** Straight vertical arrow. @param {Ctx} ctx @param {number} x @param {number} y centre
 * @param {number} s half length @param {1|-1} dir 1 = up @param {string} c */
function vArrow(ctx, x, y, s, dir, c) {
  const tip = y - dir * s;
  path(ctx, [x, y + dir * s, x, tip], s * 0.28, c);
  path(
    ctx,
    [x - s * 0.6, tip + dir * s * 0.6, x, tip, x + s * 0.6, tip + dir * s * 0.6],
    s * 0.28,
    c,
  );
}

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} R @param {string} c */
function star(ctx, x, y, R, c) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? R * 0.45 : R;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fillStyle = c;
  ctx.lineJoin = 'round';
  ctx.lineWidth = R * 0.18;
  ctx.strokeStyle = c;
  ctx.stroke();
  ctx.fill();
}

/** Marker swoosh under a heading. @param {Ctx} ctx @param {number} x0 @param {number} x1 @param {number} y
 * @param {number} w @param {string} c @param {number} [bend] */
function swoosh(ctx, x0, x1, y, w, c, bend = -6) {
  ctx.beginPath();
  ctx.moveTo(x0, y + 2);
  ctx.quadraticCurveTo((x0 + x1) / 2, y + bend, x1, y - 2);
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.strokeStyle = c;
  ctx.stroke();
}

// ---------------------------------------------------------------- text helpers

/** @param {number} size @param {number} weight @param {string} family */
function font(size, weight, family) {
  return `${weight} ${Math.round(size * 10) / 10}px ${family}`;
}

/**
 * @param {Ctx} ctx
 * @param {string} str
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} c
 * @param {{weight?: number, family?: string, align?: CanvasTextAlign, maxW?: number,
 *   baseline?: CanvasTextBaseline}} [o]
 * @returns {number} the font size actually used
 */
function text(ctx, str, x, y, size, c, o = {}) {
  const weight = o.weight ?? 700;
  const family = o.family ?? HAND;
  ctx.font = font(size, weight, family);
  ctx.letterSpacing = '0px';
  if (o.maxW) {
    const w = ctx.measureText(str).width;
    if (w > o.maxW) {
      size *= o.maxW / w;
      ctx.font = font(size, weight, family);
    }
  }
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.baseline ?? 'alphabetic';
  ctx.fillStyle = c;
  ctx.fillText(str, x, y);
  return size;
}

/** @param {Ctx} ctx @param {string} str @param {number} size @param {number} weight @param {string} family */
function measure(ctx, str, size, weight, family) {
  ctx.font = font(size, weight, family);
  ctx.letterSpacing = '0px';
  return ctx.measureText(str).width;
}

/**
 * Handwritten note, rotated around its top-left (or top-centre) anchor.
 * @param {Ctx} ctx
 * @param {string[]} lines
 * @param {number} x
 * @param {number} y baseline of the first line
 * @param {number} size
 * @param {string} c
 * @param {number} angle radians
 * @param {{align?: CanvasTextAlign, maxW?: number, lh?: number, weight?: number, family?: string,
 *   indent?: number}} [o]
 * @returns {number} the font size actually used
 */
function note(ctx, lines, x, y, size, c, angle, o = {}) {
  const weight = o.weight ?? 700;
  const family = o.family ?? HAND;
  if (o.maxW) {
    const widest = Math.max(...lines.map((l) => measure(ctx, l, size, weight, family)));
    if (widest > o.maxW) size *= o.maxW / widest;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  lines.forEach((l, i) => {
    const dx = (o.indent ?? 0) * i;
    text(ctx, l, dx, i * size * (o.lh ?? 1.18), size, c, { weight, family, align: o.align });
  });
  ctx.restore();
  return size;
}

// ---------------------------------------------------------------- icons (centred, about s wide)

/** @param {Ctx} ctx @param {string} name @param {number} x @param {number} y @param {number} s @param {string} c */
function icon(ctx, name, x, y, s, c) {
  const h = s / 2;
  const lw = Math.max(2, s * 0.075);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (name) {
    case 'target': {
      arc(ctx, x, y, h * 0.92, lw, c);
      arc(ctx, x, y, h * 0.6, lw, c);
      circle(ctx, x, y, h * 0.25, c);
      path(ctx, [x, y, x + h * 0.95, y - h * 0.95], lw, deep(c));
      path(
        ctx,
        [x + h * 0.6, y - h * 0.95, x + h * 0.95, y - h * 0.95, x + h * 0.95, y - h * 0.6],
        lw,
        deep(c),
      );
      break;
    }
    case 'gauge': {
      arc(ctx, x, y + h * 0.3, h * 0.9, lw * 1.2, c, Math.PI, TAU);
      for (let i = 0; i <= 4; i++) {
        const a = Math.PI + (i * Math.PI) / 4;
        const r0 = h * 0.62;
        const r1 = h * 0.76;
        path(
          ctx,
          [
            x + Math.cos(a) * r0,
            y + h * 0.3 + Math.sin(a) * r0,
            x + Math.cos(a) * r1,
            y + h * 0.3 + Math.sin(a) * r1,
          ],
          lw * 0.8,
          c,
        );
      }
      path(ctx, [x, y + h * 0.3, x + h * 0.45, y - h * 0.25], lw * 1.2, deep(c));
      circle(ctx, x, y + h * 0.3, h * 0.12, deep(c));
      break;
    }
    case 'people': {
      const head = (
        /** @type {number} */ px,
        /** @type {number} */ py,
        /** @type {number} */ r,
      ) => {
        arc(ctx, px, py, r, lw, c);
        ctx.beginPath();
        ctx.arc(px, py + r * 2.6, r * 1.55, Math.PI * 1.08, Math.PI * 1.92);
        ctx.lineWidth = lw;
        ctx.strokeStyle = c;
        ctx.stroke();
      };
      head(x - h * 0.55, y - h * 0.2, h * 0.22);
      head(x + h * 0.55, y - h * 0.2, h * 0.22);
      head(x, y - h * 0.35, h * 0.27);
      path(ctx, [x - h * 0.95, y + h * 0.75, x + h * 0.95, y + h * 0.75], lw, c);
      break;
    }
    case 'cloud': {
      ctx.beginPath();
      ctx.arc(x - h * 0.45, y - h * 0.35, h * 0.3, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(x - h * 0.05, y - h * 0.62, h * 0.38, Math.PI * 1.05, Math.PI * 1.85);
      ctx.arc(x + h * 0.5, y - h * 0.35, h * 0.3, Math.PI * 1.4, Math.PI * 0.5);
      ctx.closePath();
      ctx.lineWidth = lw;
      ctx.strokeStyle = c;
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const yy = y + h * 0.05 + i * h * 0.32;
        frameRect(ctx, x - h * 0.55, yy, h * 1.1, h * 0.26, 4, lw * 0.8, c);
        circle(ctx, x - h * 0.35, yy + h * 0.13, lw * 0.6, c);
        path(ctx, [x, yy + h * 0.13, x + h * 0.35, yy + h * 0.13], lw * 0.7, c);
      }
      break;
    }
    case 'shield': {
      ctx.beginPath();
      ctx.moveTo(x, y - h * 0.95);
      ctx.quadraticCurveTo(x + h * 0.5, y - h * 0.65, x + h * 0.85, y - h * 0.7);
      ctx.quadraticCurveTo(x + h * 0.9, y + h * 0.5, x, y + h * 0.95);
      ctx.quadraticCurveTo(x - h * 0.9, y + h * 0.5, x - h * 0.85, y - h * 0.7);
      ctx.quadraticCurveTo(x - h * 0.5, y - h * 0.65, x, y - h * 0.95);
      ctx.lineWidth = lw * 1.2;
      ctx.strokeStyle = c;
      ctx.stroke();
      check(ctx, x, y, h * 0.38, lw * 1.2, c);
      break;
    }
    case 'bulb': {
      arc(ctx, x, y - h * 0.2, h * 0.5, lw, c, Math.PI * 0.78, Math.PI * 2.22);
      path(
        ctx,
        [
          x - h * 0.3,
          y + h * 0.2,
          x - h * 0.25,
          y + h * 0.5,
          x + h * 0.25,
          y + h * 0.5,
          x + h * 0.3,
          y + h * 0.2,
        ],
        lw,
        c,
      );
      path(ctx, [x - h * 0.2, y + h * 0.68, x + h * 0.2, y + h * 0.68], lw, c);
      path(ctx, [x - h * 0.1, y + h * 0.84, x + h * 0.1, y + h * 0.84], lw, c);
      path(
        ctx,
        [x - h * 0.15, y - h * 0.05, x, y + h * 0.15, x + h * 0.15, y - h * 0.05],
        lw * 0.7,
        K.gold,
      );
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (1.0 + i * 0.25);
        path(
          ctx,
          [
            x + Math.cos(a) * h * 0.72,
            y - h * 0.2 + Math.sin(a) * h * 0.72,
            x + Math.cos(a) * h * 0.95,
            y - h * 0.2 + Math.sin(a) * h * 0.95,
          ],
          lw,
          K.gold,
        );
      }
      break;
    }
    case 'hourglass': {
      path(ctx, [x - h * 0.6, y - h * 0.9, x + h * 0.6, y - h * 0.9], lw * 1.3, c);
      path(ctx, [x - h * 0.6, y + h * 0.9, x + h * 0.6, y + h * 0.9], lw * 1.3, c);
      path(
        ctx,
        [
          x - h * 0.45,
          y - h * 0.9,
          x - h * 0.45,
          y - h * 0.6,
          x + h * 0.45,
          y + h * 0.6,
          x + h * 0.45,
          y + h * 0.9,
        ],
        lw,
        c,
      );
      path(
        ctx,
        [
          x + h * 0.45,
          y - h * 0.9,
          x + h * 0.45,
          y - h * 0.6,
          x - h * 0.45,
          y + h * 0.6,
          x - h * 0.45,
          y + h * 0.9,
        ],
        lw,
        c,
      );
      poly(ctx, [x - h * 0.3, y - h * 0.55, x + h * 0.3, y - h * 0.55, x, y - h * 0.15], c);
      poly(ctx, [x - h * 0.4, y + h * 0.82, x + h * 0.4, y + h * 0.82, x, y + h * 0.4], c);
      break;
    }
    case 'compass': {
      arc(ctx, x, y, h * 0.92, lw * 1.2, c);
      poly(
        ctx,
        [x + h * 0.5, y - h * 0.5, x + h * 0.1, y + h * 0.1, x - h * 0.1, y - h * 0.1],
        K.red,
      );
      poly(ctx, [x - h * 0.5, y + h * 0.5, x + h * 0.1, y + h * 0.1, x - h * 0.1, y - h * 0.1], c);
      circle(ctx, x, y, h * 0.08, '#ffffff');
      break;
    }
    case 'pin': {
      ctx.beginPath();
      ctx.arc(x, y - h * 0.35, h * 0.55, Math.PI * (5 / 6), Math.PI * (1 / 6));
      ctx.lineTo(x, y + h * 0.95);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      circle(ctx, x, y - h * 0.35, h * 0.22, '#ffffff');
      break;
    }
    case 'handshake': {
      // Two sleeves meeting in a clasp.
      poly(
        ctx,
        [
          x - h * 1.0,
          y - h * 0.25,
          x - h * 0.7,
          y - h * 0.55,
          x - h * 0.4,
          y - h * 0.2,
          x - h * 0.7,
          y + h * 0.1,
        ],
        c,
      );
      poly(
        ctx,
        [
          x + h * 1.0,
          y - h * 0.25,
          x + h * 0.7,
          y - h * 0.55,
          x + h * 0.4,
          y - h * 0.2,
          x + h * 0.7,
          y + h * 0.1,
        ],
        c,
      );
      ctx.beginPath();
      ctx.moveTo(x - h * 0.45, y - h * 0.3);
      ctx.quadraticCurveTo(x - h * 0.1, y - h * 0.55, x + h * 0.15, y - h * 0.35);
      ctx.lineTo(x + h * 0.5, y - h * 0.1);
      ctx.quadraticCurveTo(x + h * 0.45, y + h * 0.35, x + h * 0.05, y + h * 0.45);
      ctx.quadraticCurveTo(x - h * 0.35, y + h * 0.3, x - h * 0.6, y);
      ctx.closePath();
      ctx.fillStyle = tint(c);
      ctx.fill();
      ctx.lineWidth = lw;
      ctx.strokeStyle = c;
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const fx = x - h * 0.2 + i * h * 0.2;
        path(
          ctx,
          [fx, y - h * 0.05 + i * h * 0.05, fx + h * 0.18, y + h * 0.25 + i * h * 0.03],
          lw * 0.8,
          c,
        );
      }
      break;
    }
    case 'star': {
      star(ctx, x, y + h * 0.05, h * 0.9, c);
      break;
    }
    case 'bars': {
      const bw = h * 0.32;
      for (let i = 0; i < 4; i++) {
        const bh = h * (0.45 + i * 0.35);
        box(ctx, x - h * 0.9 + i * bw * 1.45, y + h * 0.9 - bh, bw, bh, 2, c);
      }
      curvedArrow(
        ctx,
        [x - h * 0.95, y - h * 0.1, x - h * 0.2, y - h * 0.3, x + h * 0.95, y - h * 0.95],
        lw,
        K.green,
      );
      break;
    }
    case 'monitor': {
      frameRect(ctx, x - h * 0.95, y - h * 0.8, h * 1.6, h * 1.1, 5, lw, c);
      path(ctx, [x - h * 0.15, y + h * 0.3, x - h * 0.15, y + h * 0.65], lw, c);
      path(ctx, [x - h * 0.5, y + h * 0.7, x + h * 0.2, y + h * 0.7], lw, c);
      gear(ctx, x + h * 0.6, y + h * 0.35, h * 0.4, lw, c);
      break;
    }
    case 'gear': {
      gear(ctx, x, y, h * 0.85, lw * 1.2, c);
      break;
    }
    case 'cap': {
      poly(ctx, [x - h, y - h * 0.3, x, y - h * 0.75, x + h, y - h * 0.3, x, y + h * 0.15], c);
      ctx.beginPath();
      ctx.moveTo(x - h * 0.55, y - h * 0.05);
      ctx.lineTo(x - h * 0.55, y + h * 0.45);
      ctx.quadraticCurveTo(x, y + h * 0.8, x + h * 0.55, y + h * 0.45);
      ctx.lineTo(x + h * 0.55, y - h * 0.05);
      ctx.lineWidth = lw;
      ctx.strokeStyle = c;
      ctx.stroke();
      path(ctx, [x + h * 0.85, y - h * 0.3, x + h * 0.85, y + h * 0.4], lw * 0.8, K.gold);
      circle(ctx, x + h * 0.85, y + h * 0.45, lw, K.gold);
      break;
    }
    case 'coins': {
      for (let i = 0; i < 3; i++) {
        const yy = y + h * 0.55 - i * h * 0.38;
        ctx.beginPath();
        ctx.ellipse(x, yy, h * 0.7, h * 0.24, 0, 0, TAU);
        ctx.fillStyle = mix(K.gold, '#ffffff', 0.2);
        ctx.fill();
        ctx.lineWidth = lw * 0.8;
        ctx.strokeStyle = c;
        ctx.stroke();
      }
      text(ctx, '€', x, y - h * 0.2, h * 0.38, c, {
        align: 'center',
        baseline: 'middle',
        family: SANS,
        weight: 900,
      });
      break;
    }
    case 'scale': {
      path(ctx, [x, y - h * 0.85, x, y + h * 0.75], lw, c);
      path(ctx, [x - h * 0.45, y + h * 0.8, x + h * 0.45, y + h * 0.8], lw * 1.2, c);
      path(ctx, [x - h * 0.8, y - h * 0.55, x + h * 0.8, y - h * 0.55], lw, c);
      for (const sx of [-1, 1]) {
        const px = x + sx * h * 0.7;
        path(
          ctx,
          [
            px,
            y - h * 0.55,
            px - h * 0.3,
            y + h * 0.1,
            px + h * 0.3,
            y + h * 0.1,
            px,
            y - h * 0.55,
          ],
          lw * 0.7,
          c,
        );
        ctx.beginPath();
        ctx.arc(px, y + h * 0.1, h * 0.3, 0, Math.PI);
        ctx.fillStyle = c;
        ctx.fill();
      }
      circle(ctx, x, y - h * 0.85, lw * 1.2, c);
      break;
    }
    case 'smiley': {
      arc(ctx, x, y, h * 0.9, lw * 1.1, c);
      circle(ctx, x - h * 0.32, y - h * 0.22, lw * 0.9, c);
      circle(ctx, x + h * 0.32, y - h * 0.22, lw * 0.9, c);
      arc(ctx, x, y + h * 0.05, h * 0.48, lw * 1.1, c, Math.PI * 0.18, Math.PI * 0.82);
      break;
    }
    case 'recruit': {
      arc(ctx, x - h * 0.3, y - h * 0.35, h * 0.3, lw, c);
      ctx.beginPath();
      ctx.arc(x - h * 0.3, y + h * 0.6, h * 0.6, Math.PI * 1.1, Math.PI * 1.9);
      ctx.lineWidth = lw;
      ctx.strokeStyle = c;
      ctx.stroke();
      arc(ctx, x + h * 0.38, y + h * 0.15, h * 0.32, lw, K.ink);
      path(ctx, [x + h * 0.62, y + h * 0.4, x + h * 0.95, y + h * 0.75], lw * 1.4, K.ink);
      break;
    }
    case 'flag': {
      path(ctx, [x - h * 0.5, y + h * 0.95, x - h * 0.5, y - h * 0.9], lw, c);
      poly(ctx, [x - h * 0.5, y - h * 0.9, x + h * 0.8, y - h * 0.6, x - h * 0.5, y - h * 0.25], c);
      break;
    }
    case 'checkCircle': {
      arc(ctx, x, y, h * 0.9, lw * 1.2, c);
      check(ctx, x, y + h * 0.05, h * 0.4, lw * 1.3, c);
      break;
    }
    case 'roadmap': {
      icon(ctx, 'flag', x + h * 0.2, y - h * 0.2, s * 0.7, c);
      break;
    }
  }
  ctx.restore();
}

/** @param {Ctx} ctx @param {number} x @param {number} y @param {number} r @param {number} lw @param {string} c */
function gear(ctx, x, y, r, lw, c) {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i * TAU) / 16;
    const d = i % 2 ? r * 0.78 : r;
    ctx.lineTo(x + Math.cos(a - 0.1) * d, y + Math.sin(a - 0.1) * d);
    ctx.lineTo(x + Math.cos(a + 0.1) * d, y + Math.sin(a + 0.1) * d);
  }
  ctx.closePath();
  ctx.lineWidth = lw;
  ctx.strokeStyle = c;
  ctx.lineJoin = 'round';
  ctx.stroke();
  arc(ctx, x, y, r * 0.35, lw, c);
}

// ---------------------------------------------------------------- board building blocks

/**
 * Coloured rounded card with icon + heading. Returns the free content area.
 * @param {Ctx} ctx
 * @param {Rect} r
 * @param {string} c
 * @param {string | string[]} title
 * @param {string} iconName
 * @param {{titleSize?: number, iconSize?: number}} [o]
 * @returns {Rect}
 */
function card(ctx, r, c, title, iconName, o = {}) {
  box(ctx, r.x, r.y, r.w, r.h, 16, mix(c, '#ffffff', 0.94));
  frameRect(ctx, r.x, r.y, r.w, r.h, 16, 3.2, c);
  frameRect(ctx, r.x + 1.5, r.y + 2, r.w - 2, r.h - 3, 16, 1, mix(c, '#ffffff', 0.5));
  const lines = (Array.isArray(title) ? title : [title]).map((l) => l.toUpperCase());
  const is = o.iconSize ?? 50;
  const ix = r.x + 16 + is / 2;
  const tx = ix + is / 2 + 12;
  const maxW = r.x + r.w - 14 - tx;
  const size = o.titleSize ?? (lines.length > 1 ? 22 : 26);
  icon(ctx, iconName, ix, r.y + 14 + is / 2, is, c);
  let used = size;
  lines.forEach((l) => {
    used = Math.min(used, (maxW / Math.max(1, measure(ctx, l, size, 800, HEAD))) * size);
  });
  const lh = used * 1.08;
  const top = r.y + 18 + used * 0.82;
  let widest = 0;
  lines.forEach((l, i) => {
    text(ctx, l, tx, top + i * lh, used, deep(c), { weight: 800, family: HEAD });
    widest = Math.max(widest, measure(ctx, l, used, 800, HEAD));
  });
  const uy = top + (lines.length - 1) * lh + 9;
  swoosh(ctx, tx, tx + widest, uy, 3, c, -2);
  const head = Math.max(is + 22, uy - r.y + 12);
  return { x: r.x + 18, y: r.y + head, w: r.w - 34, h: r.h - head - 12 };
}

/**
 * Bullet list auto-fitted inside a rect: font shrinks so nothing overflows.
 * @param {Ctx} ctx
 * @param {string[]} items
 * @param {Rect} r
 * @param {string} c bullet colour
 * @param {Bullet} kind
 * @param {{max?: number, ink?: string, start?: number, step?: number}} [o]
 * @returns {number} the font size used
 */
function list(ctx, items, r, c, kind, o = {}) {
  const n = items.length;
  const ind = (/** @type {number} */ s) => s * (kind === 'dot' ? 1.05 : 1.55);
  const size = fitList(ctx, items, r, kind, o.max ?? 22);
  const step = Math.min(r.h / n, o.step ?? size * 1.62);
  items.forEach((s, i) => {
    const cy = r.y + step * (i + 0.5);
    const mx = r.x + size * 0.45;
    const b = size * 0.42;
    if (kind === 'dot') circle(ctx, r.x + size * 0.3, cy + 1, size * 0.17, c);
    else if (kind === 'box') {
      frameRect(ctx, mx - b, cy - b, b * 2, b * 2, 2, Math.max(1.6, size * 0.09), c);
      check(ctx, mx + b * 0.1, cy, b * 0.75, Math.max(2, size * 0.12), c);
    } else if (kind === 'tick') check(ctx, mx, cy, b * 0.85, Math.max(2.2, size * 0.14), c);
    else if (kind === 'round') {
      circle(ctx, mx, cy, b * 1.1, c);
      check(ctx, mx, cy + 1, b * 0.55, Math.max(2, size * 0.12), '#ffffff');
    } else {
      circle(ctx, mx, cy, b * 1.1, c);
      text(ctx, String((o.start ?? 1) + i), mx, cy + 1, size * 0.72, '#ffffff', {
        align: 'center',
        baseline: 'middle',
        family: SANS,
        weight: 800,
      });
    }
    text(ctx, s, r.x + ind(size), cy + 1, size, o.ink ?? K.ink, {
      weight: 400,
      baseline: 'middle',
    });
  });
  return size;
}

/**
 * Largest font size (up to max) at which a bullet list fits in r.
 * @param {Ctx} ctx
 * @param {string[]} items
 * @param {Rect} r
 * @param {Bullet} kind
 * @param {number} max
 */
function fitList(ctx, items, r, kind, max) {
  const ind = (/** @type {number} */ s) => s * (kind === 'dot' ? 1.05 : 1.55);
  let size = Math.min(max, r.h / items.length / 1.28);
  for (let k = 0; k < 4; k++) {
    const widest = Math.max(...items.map((s) => measure(ctx, s, size, 400, HAND)));
    const avail = r.w - ind(size);
    if (widest > avail) size *= avail / widest;
  }
  return size;
}

/** Aluminium frame, opaque white board, dark corner caps. @param {Ctx} ctx */
function boardFrame(ctx) {
  const X = 20;
  const Y = 26;
  const W = BW - 40;
  const H = 1124;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  box(ctx, X, Y, W, H, 22, '#c9cdd3');
  ctx.restore();
  const al = ctx.createLinearGradient(0, Y, 0, Y + H);
  al.addColorStop(0, '#f6f7f9');
  al.addColorStop(0.5, '#c4c8cf');
  al.addColorStop(1, '#eceef1');
  box(ctx, X, Y, W, H, 22, al);
  frameRect(ctx, X + 1, Y + 1, W - 2, H - 2, 21, 2, '#9ea3ab');
  // Corner caps (the board covers their inner part, leaving an L shape).
  const cap = 66;
  for (const [cx, cy] of [
    [X, Y],
    [X + W - cap, Y],
    [X, Y + H - cap],
    [X + W - cap, Y + H - cap],
  ]) {
    const g = ctx.createLinearGradient(cx, cy, cx + cap, cy + cap);
    g.addColorStop(0, '#5a6069');
    g.addColorStop(1, '#2f343b');
    box(ctx, cx, cy, cap, cap, 20, g);
  }
  const b = { x: X + 22, y: Y + 22, w: W - 44, h: H - 44 };
  const wb = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  wb.addColorStop(0, '#ffffff');
  wb.addColorStop(0.55, '#f7f9fb');
  wb.addColorStop(1, '#eef1f5');
  box(ctx, b.x, b.y, b.w, b.h, 4, wb);
  // Soft sheen.
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.w, b.h);
  ctx.clip();
  ctx.globalAlpha = 0.35;
  poly(
    ctx,
    [b.x + 260, b.y, b.x + 520, b.y, b.x + 120, b.y + b.h, b.x - 140, b.y + b.h],
    '#ffffff',
  );
  ctx.restore();
  frameRect(ctx, b.x, b.y, b.w, b.h, 4, 2, '#a7acb4');
}

/** Marker tray with four markers and an eraser. @param {Ctx} ctx */
function tray(ctx) {
  const y = 1150;
  const g = ctx.createLinearGradient(0, y, 0, y + 22);
  g.addColorStop(0, '#f1f2f4');
  g.addColorStop(1, '#9aa0a8');
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  box(ctx, 300, y, 1000, 20, [2, 2, 8, 8], g);
  ctx.restore();
  [K.ink, K.blue, K.red, K.green].forEach((c, i) => {
    const x = 380 + i * 175;
    const my = y - 22;
    const bg = ctx.createLinearGradient(0, my, 0, my + 20);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, '#c9ccd2');
    box(ctx, x, my, 150, 20, 6, bg);
    box(ctx, x + 40, my + 3, 74, 14, 3, c);
    text(ctx, 'NAO', x + 77, my + 10.5, 11, '#ffffff', {
      align: 'center',
      baseline: 'middle',
      family: SANS,
      weight: 900,
    });
    const cg = ctx.createLinearGradient(0, my - 2, 0, my + 22);
    cg.addColorStop(0, mix(c, '#ffffff', 0.25));
    cg.addColorStop(1, deep(c));
    box(ctx, x - 44, my - 2, 48, 24, [10, 4, 4, 10], cg);
    box(ctx, x + 146, my + 4, 12, 12, 3, c);
  });
  const ex = 1110;
  box(ctx, ex, y - 34, 150, 30, 7, '#2e3238');
  box(ctx, ex + 4, y - 10, 142, 8, 3, '#8d929a');
  box(ctx, ex + 10, y - 30, 130, 5, 3, '#4a4f57');
}

/** @param {Ctx} ctx @param {string} title @param {number} cx @param {number} y baseline @param {number} maxW @param {string} under */
function bigTitle(ctx, title, cx, y, maxW, under) {
  const size = text(ctx, title, cx + 4, y + 4, 96, 'rgba(20, 30, 70, 0.12)', {
    family: HEAD,
    weight: 900,
    align: 'center',
    maxW,
  });
  text(ctx, title, cx, y, size, K.navy, { family: HEAD, weight: 900, align: 'center', maxW });
  const w = measure(ctx, title, size, 900, HEAD);
  swoosh(ctx, cx - w / 2 - 6, cx + w / 2 + 10, y + 26, 8, under, -10);
  swoosh(ctx, cx - w / 2 + 40, cx + w / 2 - 60, y + 38, 3, under, -6);
}

/** Small rising bar chart doodle. @param {Ctx} ctx @param {number} x @param {number} y bottom-left @param {number} s */
function risingBars(ctx, x, y, s) {
  for (let i = 0; i < 4; i++) {
    const h = s * (0.35 + i * 0.25);
    frameRect(ctx, x + i * s * 0.32, y - h, s * 0.2, h, 2, 3, K.navy);
    box(ctx, x + i * s * 0.32, y - h, s * 0.2, h, 2, mix(K.green, '#ffffff', 0.3));
  }
  curvedArrow(
    ctx,
    [x - s * 0.3, y - s * 0.55, x + s * 0.4, y - s * 0.75, x + s * 1.2, y - s * 1.3],
    4,
    K.green,
  );
}

// ---------------------------------------------------------------- techServicesDirector board

/** @param {Ctx} ctx */
function drawOps(ctx) {
  // Header.
  icon(ctx, 'bulb', 104, 118, 66, K.green);
  note(
    ctx,
    ['Des technologies', "d'aujourd'hui", 'pour les succès', 'de demain !'],
    150,
    100,
    23,
    K.navy,
    -0.1,
    {
      maxW: 190,
    },
  );
  swoosh(ctx, 170, 290, 194, 3, K.green, -4);
  bigTitle(ctx, 'TECHNOLOGIES & SERVICES', 820, 152, 880, K.sky);
  const words = ['INFRASTRUCTURES', 'EXPERTISES', 'SERVICES', 'PERFORMANCE', 'VALEUR CLIENT'];
  const sub = 21;
  const gap = 46;
  const widths = words.map((w) => measure(ctx, w, sub, 700, HAND));
  let sx = 820 - (widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1)) / 2;
  words.forEach((w, i) => {
    text(ctx, w, sx, 222, sub, K.navy, { weight: 700 });
    sx += widths[i];
    if (i < words.length - 1) circle(ctx, sx + gap / 2, 215, 4.5, K.blue);
    sx += gap;
  });
  note(ctx, ['« Plus loin', 'ensemble ! »'], 1300, 112, 38, K.navy, -0.13, {
    indent: 18,
    maxW: 220,
  });
  swoosh(ctx, 1320, 1440, 186, 4, K.green, -14);
  risingBars(ctx, 1450, 222, 70);

  // Row 1.
  const r1 = 246;
  const h1 = 300;
  const w1 = (1480 - 3 * 14) / 4;
  /** @type {[string, string, string, string[], string, string[]][]} */
  const row1 = [
    [
      'Architecture & Infra',
      K.blue,
      'cloud',
      [
        'Cloud public & privé',
        'Infrastructures & plateformes',
        "Architecture d'entreprise",
        'Sécurité & conformité',
        'Urbanisation & standards',
        'FinOps & optimisation',
      ],
      'gear',
      ['Des fondations solides', 'pour la croissance !'],
    ],
    [
      'Run & Support',
      K.green,
      'monitor',
      [
        'Exploitation & supervision',
        'Support utilisateurs',
        'Gestion des incidents',
        'Continuité & disponibilité',
        'Automatisation & outillage',
        'Amélioration continue',
      ],
      'shield',
      ['Des services fiables', 'au quotidien'],
    ],
    [
      'Delivery & Équipes',
      K.orange,
      'people',
      [
        'Pilotage des engagements',
        'Coordination multi-projets',
        'Allocation des ressources',
        'Accompagnement des équipes',
        'Qualité de livraison',
        'Agilité & méthodes',
      ],
      'target',
      ['Des équipes engagées', 'pour des clients réussis'],
    ],
    [
      'Compétences',
      K.purple,
      'cap',
      [
        'Recrutement & attractivité',
        'Montée en compétences',
        'Certifications & parcours',
        'Mobilité interne',
        "Communautés d'experts",
        'Veille technologique',
      ],
      'bars',
      ['Des talents qui', 'font la différence'],
    ],
  ];
  row1.forEach(([title, c, ic, items, footIcon, foot], i) => {
    const r = { x: 60 + i * (w1 + 14), y: r1, w: w1, h: h1 };
    const a = card(ctx, r, c, title, ic);
    const fh = 64;
    list(ctx, items, { x: a.x + 6, y: a.y, w: a.w - 6, h: a.h - fh - 6 }, c, 'dot', { max: 20 });
    const f = { x: r.x + 12, y: r.y + r.h - fh - 10, w: r.w - 24, h: fh };
    box(ctx, f.x, f.y, f.w, f.h, 12, mix(c, '#ffffff', 0.78));
    icon(ctx, footIcon, f.x + 34, f.y + f.h / 2, 40, deep(c));
    note(ctx, foot, f.x + 66, f.y + 27, 21, deep(c), -0.02, { maxW: f.w - 76, lh: 1.15 });
  });

  // Row 2.
  const r2 = r1 + h1 + 12;
  const h2 = 258;
  objectifs(ctx, { x: 60, y: r2, w: 380, h: h2 });
  indicateurs(ctx, { x: 454, y: r2, w: 386, h: h2 });
  intercontrat(ctx, { x: 854, y: r2, w: 330, h: h2 });
  salaireMarge(ctx, { x: 1198, y: r2, w: 342, h: h2 });

  // Row 3.
  const r3 = r2 + h2 + 12;
  const h3 = 1100 - r3;
  axes(ctx, { x: 60, y: r3, w: 450, h: h3 });
  {
    const a = card(
      ctx,
      { x: 524, y: r3, w: 244, h: h3 },
      K.green,
      ['Qualité', 'de service'],
      'checkCircle',
      { iconSize: 44 },
    );
    list(
      ctx,
      [
        'SLA respectés',
        'Satisfaction utilisateurs',
        'Réactivité & résolution',
        'Amélioration continue',
      ],
      { ...a, h: a.h - 50 },
      K.green,
      'box',
      { max: 19 },
    );
    for (let i = 0; i < 5; i++)
      star(ctx, a.x + a.w / 2 + (i - 2) * 38, a.y + a.h - 20, 15, K.green);
  }
  {
    const a = card(
      ctx,
      { x: 782, y: r3, w: 252, h: h3 },
      K.purple,
      ['Capacité &', 'performance'],
      'gauge',
      { iconSize: 44 },
    );
    list(
      ctx,
      [
        "Taux d'occupation",
        'Capacité de delivery',
        'Usage des compétences',
        'Performance des services',
        'Optimisation des coûts',
      ],
      a,
      K.purple,
      'box',
      { max: 19 },
    );
  }
  {
    const a = card(ctx, { x: 1048, y: r3, w: 236, h: h3 }, K.orange, 'Innovation', 'bulb', {
      iconSize: 44,
    });
    list(
      ctx,
      [
        'Veille & POC',
        'Automatisation',
        'IA générative',
        'Nouvelles offres',
        'Partenariats éditeurs',
      ],
      { ...a, h: a.h - 78 },
      K.orange,
      'box',
      { max: 19 },
    );
    note(ctx, ["De l'idée", "à l'impact !"], a.x + 40, a.y + a.h - 34, 24, K.red, -0.07, {
      indent: 22,
      maxW: a.w - 70,
    });
  }
  {
    const a = card(
      ctx,
      { x: 1298, y: r3, w: 242, h: h3 },
      K.blue,
      ['Satisfaction', 'client'],
      'handshake',
      { iconSize: 44 },
    );
    list(
      ctx,
      [
        'Écoute & proximité',
        'Qualité de delivery',
        'Création de valeur',
        'Relations durables',
        'Recommandations',
      ],
      { ...a, h: a.h - 58 },
      K.blue,
      'box',
      { max: 19 },
    );
    note(
      ctx,
      ['Des clients satisfaits,', 'une croissance durable !'],
      a.x + 2,
      a.y + a.h - 30,
      19,
      K.blue,
      -0.06,
      { maxW: a.w - 10 },
    );
  }
}

/** @param {Ctx} ctx @param {Rect} r */
function objectifs(ctx, r) {
  const a = card(ctx, r, K.red, 'Objectifs', 'target');
  list(
    ctx,
    [
      'Croissance rentable',
      'Excellence opérationnelle',
      'Satisfaction client',
      'Développement des talents',
      'Innovation & offres',
      'Intercontrat maîtrisé',
    ],
    { ...a, w: a.w * 0.66 },
    K.red,
    'box',
    { max: 20 },
  );
  // Mountain + flag.
  const mx = a.x + a.w * 0.83;
  const my = a.y + a.h * 0.42;
  poly(
    ctx,
    [mx - 62, my + 26, mx - 18, my - 36, mx, my - 14, mx + 14, my - 48, mx + 58, my + 26],
    mix(K.navy, '#ffffff', 0.15),
  );
  poly(ctx, [mx - 18, my - 36, mx - 8, my - 22, mx - 22, my - 28], '#ffffff');
  poly(ctx, [mx + 14, my - 48, mx + 26, my - 30, mx + 14, my - 36, mx + 4, my - 30], '#ffffff');
  path(ctx, [mx + 14, my - 48, mx + 14, my - 82], 3, K.ink);
  poly(ctx, [mx + 14, my - 82, mx + 40, my - 74, mx + 14, my - 64], K.red);
  note(ctx, ['Ambition', '2026 !'], mx - 52, my + 66, 28, K.red, -0.18, { maxW: 104, indent: 10 });
}

/** @param {Ctx} ctx @param {Rect} r */
function indicateurs(ctx, r) {
  const a = card(ctx, r, K.teal, 'Indicateurs clés', 'bars');
  /** @type {[string, string, 1|-1][]} */
  const rows = [
    ["Chiffre d'affaires", '+ 8 %', 1],
    ['Marge opérationnelle', '+ 2 pts', 1],
    ["Taux d'occupation", '90 %', 1],
    ['Intercontrat', '0 %', -1],
    ['Satisfaction client', '9 / 10', 1],
    ['Qualité de service', '99 %', 1],
    ['Turnover', '- 2 pts', -1],
  ];
  const c1 = a.x + a.w * 0.6;
  const c2 = a.x + a.w * 0.8;
  const hh = 24;
  const rh = (a.h - hh) / rows.length;
  const size = Math.min(17, rh * 0.68);
  text(ctx, 'KPI', a.x + 26, a.y + 16, 16, deep(K.teal), { weight: 700, baseline: 'middle' });
  text(ctx, 'Cible', (c1 + c2) / 2, a.y + 16, 16, deep(K.teal), {
    weight: 700,
    align: 'center',
    baseline: 'middle',
  });
  text(ctx, 'Tendance', (c2 + a.x + a.w) / 2, a.y + 16, 15, deep(K.teal), {
    weight: 700,
    align: 'center',
    baseline: 'middle',
    maxW: a.x + a.w - c2 - 4,
  });
  path(ctx, [a.x, a.y + hh + 3, a.x + a.w, a.y + hh + 3], 2, K.teal);
  path(ctx, [c1, a.y + 4, c1, a.y + a.h], 1.5, mix(K.teal, '#ffffff', 0.4));
  path(ctx, [c2, a.y + 4, c2, a.y + a.h], 1.5, mix(K.teal, '#ffffff', 0.4));
  rows.forEach(([kpi, target, dir], i) => {
    const cy = a.y + hh + 3 + rh * (i + 0.5);
    if (i > 0)
      path(ctx, [a.x, cy - rh / 2, a.x + a.w, cy - rh / 2], 1, mix(K.teal, '#ffffff', 0.7));
    circle(ctx, a.x + 9, cy, 4.5, K.teal);
    text(ctx, kpi, a.x + 22, cy + 1, size, K.ink, {
      weight: 400,
      baseline: 'middle',
      maxW: c1 - a.x - 28,
    });
    text(ctx, target, (c1 + c2) / 2, cy + 1, size, K.ink, {
      weight: 700,
      align: 'center',
      baseline: 'middle',
      maxW: c2 - c1 - 8,
    });
    vArrow(ctx, (c2 + a.x + a.w) / 2, cy, rh * 0.34, dir, K.green);
  });
}

/** @param {Ctx} ctx @param {Rect} r */
function intercontrat(ctx, r) {
  const a = card(ctx, r, K.red, 'Intercontrat', 'hourglass');
  note(ctx, ['à tendre vers 0 !'], a.x + 4, a.y + 18, 27, K.red, -0.05, { maxW: a.w - 10 });
  swoosh(ctx, a.x + 6, a.x + 200, a.y + 30, 3, K.red, -3);
  const base = a.y + a.h - 24;
  const top = a.y + 70;
  const vals = [8, 4, 2, 0];
  const bw = 34;
  const x0 = a.x + 14;
  path(ctx, [x0 - 4, top - 10, x0 - 4, base, x0 + 4 * 52 + 4, base], 3, K.ink);
  vals.forEach((v, i) => {
    const x = x0 + 8 + i * 52;
    const h = ((base - top) * v) / 8;
    if (h > 0) box(ctx, x, base - h, bw, h, [3, 3, 0, 0], mix(K.grey, '#ffffff', 0.15));
    text(ctx, `${v}%`, x + bw / 2, base - h - 7, 17, v === 0 ? K.green : K.ink, {
      align: 'center',
    });
    text(ctx, String(2023 + i), x + bw / 2, base + 19, 15, K.ink, { align: 'center', weight: 400 });
  });
  curvedArrow(ctx, [x0 + 40, top - 4, x0 + 110, top - 6, x0 + 186, top + 44], 4, K.red);
  const ox = a.x + a.w - 44;
  const oy = top + 34;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(-0.2);
  ctx.beginPath();
  ctx.ellipse(0, 0, 44, 36, 0, 0.3, TAU + 0.1);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = K.green;
  ctx.stroke();
  text(ctx, 'Objectif', 0, -6, 17, K.green, { align: 'center', maxW: 76 });
  text(ctx, '0 %', 0, 20, 25, K.green, { align: 'center' });
  ctx.restore();
}

/** @param {Ctx} ctx @param {Rect} r */
function salaireMarge(ctx, r) {
  const a = card(ctx, r, K.gold, 'Salaire vs Marge', 'coins');
  const gx = a.x + 10;
  const gy = a.y + 22;
  const gw = a.w * 0.56;
  const gh = a.h - 58;
  const ax = gy + gh + 8;
  text(ctx, 'Montant', gx, gy - 8, 14, K.ink, { weight: 400 });
  path(ctx, [gx, ax, gx, gy], 2.6, K.ink);
  path(ctx, [gx - 6, gy + 8, gx, gy, gx + 6, gy + 8], 2.6, K.ink);
  path(ctx, [gx, ax, gx + gw, ax], 2.6, K.ink);
  path(ctx, [gx + gw - 8, ax - 6, gx + gw, ax, gx + gw - 8, ax + 6], 2.6, K.ink);
  text(ctx, 'Temps', gx + gw - 4, ax - 8, 14, K.ink, { weight: 400, align: 'right' });
  path(ctx, [gx + 6, gy + gh * 0.72, gx + gw - 14, gy + gh * 0.5], 3.5, K.red);
  ctx.beginPath();
  ctx.moveTo(gx + 6, gy + gh * 0.95);
  ctx.quadraticCurveTo(gx + gw * 0.5, gy + gh * 0.55, gx + gw - 14, gy + gh * 0.08);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = K.green;
  ctx.stroke();
  icon(ctx, 'smiley', a.x + a.w - 24, a.y + 12, 32, K.green);
  note(
    ctx,
    ['Marge en', 'hausse =', 'activités qui', 'créent de', 'la valeur !'],
    gx + gw + 14,
    gy + 34,
    19,
    K.green,
    -0.1,
    { maxW: a.x + a.w - gx - gw - 22 },
  );
  const ly = a.y + a.h - 2;
  path(ctx, [a.x + 14, ly - 5, a.x + 44, ly - 5], 3.5, K.red);
  text(ctx, 'Salaires', a.x + 52, ly, 16, K.ink, { weight: 400 });
  path(ctx, [a.x + 150, ly - 5, a.x + 180, ly - 5], 3.5, K.green);
  text(ctx, 'Marge', a.x + 188, ly, 16, K.ink, { weight: 400 });
}

/** @param {Ctx} ctx @param {Rect} r */
function axes(ctx, r) {
  const a = card(ctx, r, K.navy, 'Axes prioritaires', 'compass');
  list(
    ctx,
    [
      'Offres & partenariats',
      'Excellence opérationnelle',
      'Montée en compétences',
      'Innovation : IA & cloud',
      'Rentabilité durable',
    ],
    { ...a, w: a.w - 112 },
    K.navy,
    'num',
    { max: 22 },
  );
  // Signpost.
  const px = a.x + a.w - 50;
  box(ctx, px - 5, a.y - 12, 10, a.h + 8, 3, mix(K.navy, '#ffffff', 0.2));
  /** @type {[string, number][]} */
  const signs = [
    ['PEOPLE', -1],
    ['TECH', 1],
    ['IMPACT', -1],
  ];
  signs.forEach(([s, d], i) => {
    const y = a.y + 8 + i * 50;
    ctx.save();
    ctx.translate(px, y + 18);
    ctx.rotate(d * 0.06);
    const w = 96;
    const x0 = -w / 2;
    poly(
      ctx,
      d < 0
        ? [x0, -16, x0 + w - 12, -16, x0 + w, 0, x0 + w - 12, 16, x0, 16]
        : [x0 + 12, -16, x0 + w, -16, x0 + w, 16, x0 + 12, 16, x0, 0],
      '#ffffff',
    );
    ctx.beginPath();
    const p =
      d < 0
        ? [x0, -16, x0 + w - 12, -16, x0 + w, 0, x0 + w - 12, 16, x0, 16]
        : [x0 + 12, -16, x0 + w, -16, x0 + w, 16, x0 + 12, 16, x0, 0];
    path(ctx, [...p, p[0], p[1]], 3, K.navy);
    text(ctx, s, d < 0 ? -4 : 4, 1, 18, K.navy, {
      family: HEAD,
      weight: 800,
      align: 'center',
      baseline: 'middle',
      maxW: 76,
    });
    ctx.restore();
  });
}

// ---------------------------------------------------------------- regionalDirector board

/** @param {Ctx} ctx */
function drawRegional(ctx) {
  // Header.
  icon(ctx, 'compass', 122, 140, 96, K.navy);
  for (let i = 0; i < 6; i++) {
    const ang = Math.PI * (0.75 + i * 0.3);
    path(
      ctx,
      [
        122 + Math.cos(ang) * 62,
        140 + Math.sin(ang) * 62,
        122 + Math.cos(ang) * 76,
        140 + Math.sin(ang) * 76,
      ],
      4,
      K.green,
    );
  }
  note(ctx, ['PILOTER', 'COORDONNER', 'DÉVELOPPER', 'PERFORMER'], 194, 96, 25, K.navy, -0.08, {
    maxW: 172,
    lh: 1.2,
  });
  bigTitle(ctx, 'RÉGION OUEST', 820, 152, 820, K.green);
  note(ctx, ['Plus loin', 'ensemble !'], 1290, 118, 46, K.navy, -0.1, { indent: 34, maxW: 220 });
  swoosh(ctx, 1300, 1380, 200, 4, K.green, -4);
  path(ctx, [1500, 96, 1514, 70], 4, K.green);

  // Row 1.
  const r1 = 232;
  const h1 = 218;
  {
    const a = card(ctx, { x: 60, y: r1, w: 400, h: h1 }, K.green, 'Résultats régionaux', 'bars');
    list(
      ctx,
      [
        "Croissance du chiffre d'affaires",
        'Rentabilité maîtrisée',
        'Objectifs en bonne trajectoire',
        'Dynamique commerciale positive',
      ],
      a,
      K.green,
      'round',
      { max: 21 },
    );
  }
  territories(ctx, { x: 474, y: r1, w: 504, h: h1 });
  {
    const a = card(ctx, { x: 992, y: r1, w: 548, h: h1 }, K.blue, 'Objectifs régionaux', 'target');
    list(
      ctx,
      [
        "Développer l'activité sur tout le territoire",
        'Renforcer la rentabilité',
        'Accroître la satisfaction clients',
        'Attirer et fidéliser les talents',
        'Structurer des partenariats durables',
      ],
      a,
      K.blue,
      'tick',
      { max: 21 },
    );
  }

  // Row 2.
  const r2 = r1 + h1 + 12;
  const h2 = 214;
  {
    const a = card(ctx, { x: 60, y: r2, w: 290, h: h2 }, K.red, 'Budget régional', 'coins');
    list(
      ctx,
      [
        'Suivi budgétaire global',
        'Investissements clés',
        'Optimisation des moyens',
        'Maîtrise des coûts',
      ],
      a,
      K.red,
      'dot',
      { max: 20 },
    );
  }
  {
    const a = card(
      ctx,
      { x: 364, y: r2, w: 300, h: h2 },
      K.purple,
      ['Suivi commercial', 'et financier'],
      'bars',
    );
    list(
      ctx,
      [
        "Chiffre d'affaires",
        'Pipeline & opportunités',
        'Taux de transformation',
        'Suivi des marges',
        'Actions correctives',
      ],
      a,
      K.purple,
      'dot',
      { max: 20 },
    );
  }
  {
    const a = card(ctx, { x: 678, y: r2, w: 300, h: h2 }, K.orange, 'Arbitrages', 'scale');
    list(
      ctx,
      [
        'Allocation des ressources',
        'Priorisation des projets',
        "Choix d'investissements",
        'Équilibre entre agences',
        'Décisions stratégiques',
      ],
      a,
      K.orange,
      'dot',
      { max: 20 },
    );
  }
  roadmap(ctx, { x: 992, y: r2, w: 548, h: h2 });

  // Row 3.
  const r3 = r2 + h2 + 12;
  const h3 = 214;
  const w3 = (1480 - 4 * 14) / 5;
  /** @type {[string, string, string, string[]][]} */
  const row3 = [
    [
      'Territoires',
      K.blue,
      'pin',
      [
        'Bretagne',
        'Pays de la Loire',
        'Centre-Val de Loire',
        'Spécificités locales',
        'Synergies régionales',
      ],
    ],
    [
      'Clients',
      K.green,
      'people',
      ['Grands comptes', 'PME / ETI', 'Secteur public', 'Fidélisation', 'Portefeuille clients'],
    ],
    [
      'Recrutement',
      K.red,
      'recruit',
      [
        'Anticipation des besoins',
        'Attractivité de la région',
        'Intégration & onboarding',
        'Fidélisation des talents',
        'Marque employeur',
      ],
    ],
    [
      'Partenaires',
      K.purple,
      'handshake',
      [
        'Partenariats stratégiques',
        'Écosystème local',
        'Co-innovation',
        'Référencements',
        'Relations durables',
      ],
    ],
    [
      'Satisfaction',
      K.sky,
      'smiley',
      ['Clients', 'Collaborateurs', 'Partenaires', 'Qualité de service', 'Écoute & feedback'],
    ],
  ];
  row3.forEach(([title, c, ic, items], i) => {
    const a = card(ctx, { x: 60 + i * (w3 + 14), y: r3, w: w3, h: h3 }, c, title, ic);
    list(ctx, items, a, c, 'dot', { max: 20 });
  });

  // Row 4.
  const r4 = r3 + h3 + 12;
  const h4 = 1100 - r4;
  {
    const r = { x: 60, y: r4, w: 610, h: h4 };
    const a = card(ctx, r, K.red, 'Priorités', 'star');
    const half = { ...a, w: a.w / 2 - 8 };
    const left = ['Croissance rentable', 'Développement territorial', 'Excellence client'];
    const right = ['Renforcement des équipes', 'Partenariats clés', 'Innovation & différenciation'];
    const max = Math.min(fitList(ctx, left, half, 'num', 21), fitList(ctx, right, half, 'num', 21));
    list(ctx, left, half, K.red, 'num', { max });
    list(ctx, right, { ...half, x: a.x + a.w / 2 + 8 }, K.red, 'num', { max, start: 4 });
  }
  curvedArrow(ctx, [690, r4 + 110, 726, r4 + 70, 770, r4 + 96], 5, K.navy);
  {
    const a = card(ctx, { x: 786, y: r4, w: 520, h: h4 }, K.green, "Plan d'action", 'gear');
    const half = { ...a, w: a.w / 2 - 6 };
    const left = ['Actions clés planifiées', 'Responsables identifiés', 'Échéances et jalons'];
    const right = ['Suivi régulier', 'Ajustements', 'Mesure des résultats'];
    const max = Math.min(fitList(ctx, left, half, 'box', 20), fitList(ctx, right, half, 'box', 20));
    list(ctx, left, half, K.green, 'box', { max });
    list(ctx, right, { ...half, x: a.x + a.w / 2 + 6 }, K.green, 'box', { max });
  }
  note(
    ctx,
    ['Une région', 'en mouvement', 'pour un impact', 'durable !'],
    1336,
    r4 + 40,
    30,
    K.navy,
    -0.16,
    { maxW: 196, indent: 8 },
  );
  swoosh(ctx, 1380, 1520, r4 + 172, 4, K.green, -10);
}

/** Stylised map of the three territories. @param {Ctx} ctx @param {Rect} r */
function territories(ctx, r) {
  const mx = r.x + 6;
  const my = r.y + 4;
  const KX = 1.15;
  /** @param {number[]} p @param {string} c */
  /** @param {number[]} p @param {string} c */
  const blob = (p, c) => {
    ctx.beginPath();
    for (let i = 0; i < p.length; i += 2) ctx.lineTo(mx + p[i] * KX, my + p[i + 1]);
    ctx.closePath();
    ctx.fillStyle = mix(c, '#ffffff', 0.45);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = deep(c);
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  // prettier-ignore
  blob([0, 70, 18, 58, 34, 62, 50, 46, 72, 50, 92, 40, 116, 48, 140, 56, 150, 80, 156, 104, 132, 118, 104, 114, 84, 124, 60, 116, 36, 118, 20, 104, 6, 96], K.sky);
  // prettier-ignore
  blob([140, 56, 166, 46, 190, 52, 214, 62, 222, 92, 226, 118, 212, 146, 204, 176, 178, 200, 150, 194, 128, 178, 112, 152, 120, 132, 132, 118, 156, 104, 150, 80], K.green);
  // prettier-ignore
  blob([214, 62, 232, 36, 250, 10, 276, 14, 296, 30, 308, 62, 318, 96, 312, 132, 300, 166, 278, 196, 250, 208, 226, 196, 204, 176, 212, 146, 226, 118, 222, 92], K.orange);
  for (const [x, y, rr] of [
    [30, 136, 7],
    [54, 150, 5],
    [12, 124, 4],
  ]) {
    circle(ctx, mx + x * KX, my + y, rr, mix(K.sky, '#ffffff', 0.35));
  }
  /** @type {[string[], number, number][]} */
  const labels = [
    [['BRETAGNE'], 80, 90],
    [['PAYS', 'DE LA', 'LOIRE'], 180, 130],
    [['CENTRE-', 'VAL DE', 'LOIRE'], 268, 92],
  ];
  for (const [lines, x, y] of labels) {
    const size = Math.min(17, ...lines.map((l) => (17 * 100) / measure(ctx, l, 17, 700, HAND)));
    lines.forEach((l, i) => {
      text(ctx, l, mx + x * KX, my + y + i * size * 1.18, size, K.navy, {
        align: 'center',
        weight: 700,
      });
    });
  }
  note(
    ctx,
    ['Des territoires,', 'des talents,', 'des opportunités !'],
    mx + 368,
    r.y + 70,
    20,
    K.navy,
    -0.2,
    { maxW: 128 },
  );
  path(ctx, [mx + 378, r.y + 140, mx + 490, r.y + 116], 3, K.green);
}

/** @param {Ctx} ctx @param {Rect} r */
function roadmap(ctx, r) {
  const a = card(ctx, r, K.green, 'Roadmap régionale', 'flag');
  // Winding road.
  const rx = a.x + 70;
  const top = a.y + 26;
  const bot = a.y + a.h;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(rx - 50, bot);
  ctx.bezierCurveTo(rx + 70, bot - 20, rx - 70, top + 70, rx + 30, top + 54);
  ctx.bezierCurveTo(rx + 70, top + 46, rx + 40, top + 10, rx + 8, top + 6);
  ctx.lineWidth = 26;
  ctx.strokeStyle = K.ink;
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([9, 9]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  path(ctx, [rx + 8, top + 6, rx + 8, top - 30], 3, K.ink);
  poly(ctx, [rx + 8, top - 30, rx + 38, top - 21, rx + 8, top - 12], K.green);
  /** @type {[string, string, string][]} */
  const steps = [
    ['T1', 'Structuration & lancement', K.orange],
    ['T2', 'Accélération commerciale', K.gold],
    ['T3', 'Déploiement & partenariats', K.green],
    ['T4', 'Consolidation & performance', K.sky],
  ];
  const lx = a.x + 160;
  const step = a.h / steps.length;
  const size = Math.min(
    20,
    ...steps.map(([, s]) => (20 * (a.x + a.w - lx - 74)) / measure(ctx, s, 20, 400, HAND)),
  );
  steps.forEach(([t, s, c], i) => {
    const cy = a.y + step * (i + 0.5);
    circle(ctx, lx + 12, cy, 12, c);
    text(ctx, t, lx + 32, cy + 1, 22, K.navy, { family: HEAD, weight: 800, baseline: 'middle' });
    text(ctx, s, lx + 74, cy + 1, size, K.ink, { weight: 400, baseline: 'middle' });
  });
}

// ---------------------------------------------------------------- public API

/**
 * Draws one of the office whiteboards (1600×1200; transparent outside the frame).
 * @param {'techServicesDirector'|'regionalDirector'} id
 * @returns {HTMLCanvasElement | OffscreenCanvas}
 */
export function renderWhiteboard(id) {
  const { canvas, ctx } = makeCanvas(BW, BH);
  boardFrame(ctx);
  if (id === 'techServicesDirector') drawOps(ctx);
  else if (id === 'regionalDirector') drawRegional(ctx);
  else throw new Error(`Unknown whiteboard: ${String(id)}`);
  tray(ctx);
  return canvas;
}

/**
 * Draws a door plaque: dark navy panel, thin gold double frame, cream bold capitals.
 * Width 1024; height grows with the number of lines.
 * @param {string[]} lines e.g. ['DIRECTEUR', 'DES OPÉRATIONS']
 * @returns {HTMLCanvasElement | OffscreenCanvas}
 */
export function renderPlaque(lines) {
  const W = 1024;
  const n = Math.max(1, lines.length);
  const lh = 104;
  const H = Math.max(300, n * lh + 150);
  const { canvas, ctx } = makeCanvas(W, H);
  // Gold bevel.
  const gold = ctx.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, '#f3dea0');
  gold.addColorStop(0.3, '#b98d3e');
  gold.addColorStop(0.55, '#f6e3a8');
  gold.addColorStop(0.8, '#9c7431');
  gold.addColorStop(1, '#e7c97c');
  box(ctx, 0, 0, W, H, 10, gold);
  // Navy panel.
  const B = 16;
  const navy = ctx.createLinearGradient(0, B, 0, H - B);
  navy.addColorStop(0, '#22344a');
  navy.addColorStop(0.5, '#172536');
  navy.addColorStop(1, '#101b28');
  box(ctx, B, B, W - 2 * B, H - 2 * B, 4, navy);
  ctx.save();
  ctx.globalAlpha = 0.07;
  poly(ctx, [B, B, W * 0.55, B, W * 0.35, H - B, B, H - B], '#ffffff');
  ctx.restore();
  frameRect(ctx, B + 1, B + 1, W - 2 * B - 2, H - 2 * B - 2, 4, 2, 'rgba(0, 0, 0, 0.45)');
  // Inner gold line.
  frameRect(ctx, B + 14, B + 14, W - 2 * B - 28, H - 2 * B - 28, 3, 2.5, '#c9a45a');
  frameRect(ctx, B + 19, B + 19, W - 2 * B - 38, H - 2 * B - 38, 2, 1, 'rgba(201, 164, 90, 0.5)');
  // Text: one shared size so lines match.
  const maxW = W - 2 * B - 100;
  let size = 76;
  for (const l of lines)
    size = Math.min(size, (size * maxW) / Math.max(1, measure(ctx, l, size, 800, SANS)));
  const y0 = H / 2 - ((n - 1) * lh) / 2;
  lines.forEach((l, i) => {
    const y = y0 + i * lh;
    text(ctx, l, W / 2 + 2, y + 3, size, 'rgba(0, 0, 0, 0.55)', {
      family: SANS,
      weight: 800,
      align: 'center',
      baseline: 'middle',
    });
    text(ctx, l, W / 2, y, size, '#f1e7cf', {
      family: SANS,
      weight: 800,
      align: 'center',
      baseline: 'middle',
    });
  });
  return canvas;
}
