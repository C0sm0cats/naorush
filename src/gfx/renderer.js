import { STRIDE } from './voxels.js';
import { identity, lookAt, multiply, ortho } from './mat4.js';

/** @typedef {import('./voxels.js').MeshPart} MeshPart */

/**
 * Extra room (world units) kept around the camera view and the sun's shadow box
 * before an item is culled. Bounding boxes are exact, so this only absorbs
 * rounding: nothing outside a frustum's side planes can reach its image.
 */
const VIEW_MARGIN = 0.5;
const SHADOW_MARGIN = 0.5;
/**
 * Items whose largest world-space size is under this (tickets, cups, small props)
 * cast no shadow: their few shadow texels are lost in the filtering anyway.
 */
const SHADOW_MIN_SIZE = 0.35;
const WHITE = new Float32Array([1, 1, 1]);
const IDENTITY = identity();
/** @type {{flash?: number}} */
const NO_FX = {};

/**
 * Axis-aligned bounding box of the interleaved vertex positions, as centre x, y, z
 * then half extents; null when the data cannot be read (never culled).
 * @param {{data: ArrayBuffer | ArrayBufferView, count: number, vertices?: number}} geo
 * @returns {Float32Array | null}
 */
function meshBox(geo) {
  const d = /** @type {unknown} */ (geo.data);
  /** @type {ArrayBuffer | undefined} */
  let buf;
  let off = 0;
  let len = 0;
  if (d instanceof ArrayBuffer) {
    buf = d;
    len = d.byteLength;
  } else if (ArrayBuffer.isView(d) && d.byteOffset % 4 === 0) {
    buf = /** @type {ArrayBuffer} */ (d.buffer);
    off = d.byteOffset;
    len = d.byteLength;
  }
  if (!buf || STRIDE % 4) return null;
  const f = new Float32Array(buf, off, len >> 2);
  const step = STRIDE / 4;
  const n = Math.min(geo.vertices ?? geo.count, Math.floor(f.length / step));
  let x0 = Infinity,
    y0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    z1 = -Infinity;
  for (let i = 0, o = 0; i < n; i++, o += step) {
    const x = f[o],
      y = f[o + 1],
      z = f[o + 2];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  if (!n) return new Float32Array(6);
  const box = new Float32Array([
    (x0 + x1) / 2,
    (y0 + y1) / 2,
    (z0 + z1) / 2,
    (x1 - x0) / 2,
    (y1 - y0) / 2,
    (z1 - z0) / 2,
  ]);
  return box.every(Number.isFinite) ? box : null;
}

/**
 * Whether an item is too small to cast a visible shadow: its bounding box, moved by
 * the model matrix, is under {@link SHADOW_MIN_SIZE} along every axis.
 * @param {Float32Array} m @param {Float32Array | null} box
 */
function tooSmall(m, box) {
  if (!box) return false;
  const ex = box[3],
    ey = box[4],
    ez = box[5];
  const h = SHADOW_MIN_SIZE / 2;
  return (
    Math.abs(m[0]) * ex + Math.abs(m[4]) * ey + Math.abs(m[8]) * ez < h &&
    Math.abs(m[1]) * ex + Math.abs(m[5]) * ey + Math.abs(m[9]) * ez < h &&
    Math.abs(m[2]) * ex + Math.abs(m[6]) * ey + Math.abs(m[10]) * ez < h
  );
}

/**
 * Left, right, bottom, top clip planes (normalised) of a view-projection matrix.
 * @param {Float32Array} m
 * @param {Float64Array} out 16 numbers: 4 planes of (nx, ny, nz, d).
 */
function extractPlanes(m, out) {
  for (let i = 0; i < 4; i++) {
    const row = i >> 1;
    const sign = i & 1 ? -1 : 1;
    const a = m[3] + sign * m[row],
      b = m[7] + sign * m[4 + row],
      c = m[11] + sign * m[8 + row],
      d = m[15] + sign * m[12 + row];
    const l = Math.hypot(a, b, c) || 1;
    out[i * 4] = a / l;
    out[i * 4 + 1] = b / l;
    out[i * 4 + 2] = c / l;
    out[i * 4 + 3] = d / l;
  }
}

/**
 * Conservative visibility test: a local bounding box, moved by the model matrix,
 * against four clip planes (the box's world extents follow Arvo's method).
 * @param {Float32Array} m Model matrix.
 * @param {Float32Array | null} box Centre then half extents; null is always visible.
 * @param {Float64Array} planes
 * @param {number} margin
 */
function visible(m, box, planes, margin) {
  if (!box) return true;
  const bx = box[0],
    by = box[1],
    bz = box[2],
    ex = box[3],
    ey = box[4],
    ez = box[5];
  const cx = m[0] * bx + m[4] * by + m[8] * bz + m[12],
    cy = m[1] * bx + m[5] * by + m[9] * bz + m[13],
    cz = m[2] * bx + m[6] * by + m[10] * bz + m[14];
  const wx = Math.abs(m[0]) * ex + Math.abs(m[4]) * ey + Math.abs(m[8]) * ez,
    wy = Math.abs(m[1]) * ex + Math.abs(m[5]) * ey + Math.abs(m[9]) * ez,
    wz = Math.abs(m[2]) * ex + Math.abs(m[6]) * ey + Math.abs(m[10]) * ez;
  for (let i = 0; i < 16; i += 4) {
    const nx = planes[i],
      ny = planes[i + 1],
      nz = planes[i + 2];
    const r = Math.abs(nx) * wx + Math.abs(ny) * wy + Math.abs(nz) * wz;
    if (nx * cx + ny * cy + nz * cz + planes[i + 3] < -(r + margin)) return false;
  }
  return true;
}

/**
 * Whether a mesh partitioned for one sun direction suits the current one (the
 * faces kept for the depth pass depend on which side of each axis the sun is).
 * @param {number[] | null} a @param {ArrayLike<number>} b
 */
function sameSun(a, b) {
  return (
    !!a &&
    Math.sign(a[0]) === Math.sign(b[0]) &&
    Math.sign(a[1]) === Math.sign(b[1]) &&
    Math.sign(a[2]) === Math.sign(b[2])
  );
}

const MAIN_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aColor;
layout(location=3) in float aMat;
uniform mat4 uModel, uViewProj, uLightVP;
uniform vec3 uTint;
out vec3 vColor, vNormal, vWorld;
out vec4 vLight;
out float vAO, vMat;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  // Linear albedo per vertex: colours are flat across each face, so this matches
  // converting per pixel at a fraction of the cost.
  vColor = pow(aColor.rgb, vec3(2.2)) * uTint;
  vAO = aColor.a;
  vMat = aMat;
  vLight = uLightVP * w;
  gl_Position = uViewProj * w;
}`;

const MAIN_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vColor, vNormal, vWorld;
in vec4 vLight;
in float vAO, vMat;
uniform sampler2DShadow uShadow;
uniform vec3 uSunDir, uSunColor, uSky, uGround, uFog, uEye;
uniform float uFogNear, uFogFar, uRim, uFlash, uAO;
uniform vec2 uInvSize;
uniform int uLights;
uniform vec4 uLightPos[8];
uniform vec3 uLightColor[8];
out vec4 outColor;

vec3 aces(vec3 x) { return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }

float shadow() {
  vec3 p = vLight.xyz / vLight.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float s = 0.0;
  vec2 texel = 1.0 / vec2(textureSize(uShadow, 0));
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      s += texture(uShadow, vec3(p.xy + vec2(x, y) * texel * 1.25, p.z - 0.0015));
  return s / 9.0;
}

void main() {
  vec3 albedo = vColor;
  vec3 n = normalize(vNormal);
  int mat = int(vMat + 0.5);
  vec3 col;
  if (mat == 2) {
    col = albedo * 2.2;
  } else {
    // Corner occlusion, dropped on struggling phones (see Renderer.lowQuality).
    float ao = uAO > 0.5 ? 0.35 + 0.65 * vAO : 1.0;
    vec3 ambient = mix(uGround, uSky, n.y * 0.5 + 0.5) * ao;
    float ndl = max(dot(n, -uSunDir), 0.0);
    vec3 light = ambient;
    // Faces turned away from the sun (most of what the camera sees) skip the shadow taps.
    if (ndl > 0.0) light += uSunColor * ndl * shadow();
    for (int i = 0; i < 8; i++) {
      if (i >= uLights) break;
      vec3 d = uLightPos[i].xyz - vWorld;
      float dist = length(d);
      if (dist >= uLightPos[i].w) continue;
      float att = 1.0 - dist / uLightPos[i].w;
      light += uLightColor[i] * att * att * max(dot(n, d / dist), 0.0) * (0.6 + 0.4 * ao);
    }
    col = albedo * light;
    vec3 v = normalize(uEye - vWorld);
    if (mat == 3) {
      vec3 h = normalize(-uSunDir + v);
      col += uSunColor * pow(max(dot(n, h), 0.0), 48.0) * 0.6;
    }
    col += uRim * pow(1.0 - max(dot(n, v), 0.0), 3.0) * vec3(1.0, 0.92, 0.8);
  }
  float depth = length(vWorld - uEye);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, depth));
  // Damage: a red glow from the edges of the screen, the middle stays clear.
  vec2 q = abs(gl_FragCoord.xy * uInvSize * 2.0 - 1.0);
  float edge = clamp(length(max(q - 0.55, 0.0)) * 2.2, 0.0, 1.0);
  col = mix(col, vec3(1.0, 0.25, 0.2), min(uFlash * 1.8, 0.65) * edge * edge);
  outColor = vec4(pow(aces(col), vec3(1.0 / 2.2)), 1.0);
}`;

const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uModel, uLightVP;
void main() { gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;
const DEPTH_FS = `#version 300 es
precision mediump float;
void main() {}`;

const SKY_VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1,-1), vec2(3,-1), vec2(-1,3));
out vec2 vUv;
void main() { vUv = P[gl_VertexID] * 0.5 + 0.5; gl_Position = vec4(P[gl_VertexID], 0.999, 1); }`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uTop, uMid, uBottom;
uniform vec2 uSun;
uniform vec3 uSunGlow;
out vec4 outColor;
void main() {
  vec3 c = vUv.y > 0.45 ? mix(uMid, uTop, (vUv.y - 0.45) / 0.55) : mix(uBottom, uMid, vUv.y / 0.45);
  float d = distance(vUv * vec2(1.6, 1.0), uSun * vec2(1.6, 1.0));
  c += uSunGlow * (smoothstep(0.09, 0.07, d) * 1.2 + exp(-d * 7.0) * 0.6);
  outColor = vec4(c, 1.0);
}`;

const SPRITE_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
uniform mat4 uViewProj;
out vec2 vUv;
out vec3 vWorld;
void main() { vUv = aUv; vWorld = aPos; gl_Position = uViewProj * vec4(aPos, 1.0); }`;
const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vWorld;
uniform sampler2D uTex;
uniform vec3 uFog, uEye;
uniform float uFogNear, uFogFar, uBright;
out vec4 outColor;
void main() {
  vec4 t = texture(uTex, vUv);
  if (t.a < 0.5) discard;
  vec3 c = t.rgb * uBright;
  c = mix(c, uFog, smoothstep(uFogNear, uFogFar, length(vWorld - uEye)) * 0.8);
  outColor = vec4(c, 1.0);
}`;

/**
 * @param {WebGL2RenderingContext} gl
 * @param {string} vs
 * @param {string} fs
 */
function program(gl, vs, fs) {
  const p = /** @type {WebGLProgram} */ (gl.createProgram());
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ]) {
    const s = /** @type {WebGLShader} */ (gl.createShader(/** @type {number} */ (type)));
    gl.shaderSource(s, /** @type {string} */ (src));
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  /** @type {Record<string, WebGLUniformLocation | null>} */
  const u = {};
  const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = /** @type {WebGLActiveInfo} */ (gl.getActiveUniform(p, i));
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

/** A GPU mesh built from {@link meshVolume} output. */
export class Mesh {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {{data: ArrayBuffer, count: number, index?: Uint16Array | Uint32Array, vertices?: number, parts?: MeshPart[], sun?: number[] | null}} geo
   *   With `index`, `count` counts indices and `vertices` the vertices. With `parts`
   *   (see {@link partitionMesh}), each part is culled and drawn on its own.
   */
  constructor(gl, geo) {
    /** Vertices to draw, or indices when indexed. */
    this.count = geo.count;
    /** Index type (0: not indexed) and bytes per index. */
    this.indexType = 0;
    this.indexBytes = 0;
    this.indexBuffer = null;
    /** Local bounding box, centre then half extents (for culling); null: never culled. */
    this.box = meshBox(geo);
    /** @type {MeshPart[] | null} */
    this.parts = geo.parts ?? null;
    /** Sun direction the parts' depth-pass ranges were chosen for. */
    this.sun = geo.sun ?? null;
    this.vao = /** @type {WebGLVertexArrayObject} */ (gl.createVertexArray());
    this.buffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, geo.data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.BYTE, true, STRIDE, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, STRIDE, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.UNSIGNED_BYTE, false, STRIDE, 20);
    if (geo.index) {
      this.indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.index, gl.STATIC_DRAW);
      const wide = geo.index instanceof Uint32Array;
      this.indexType = wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      this.indexBytes = wide ? 4 : 2;
    }
    gl.bindVertexArray(null);
  }

  /**
   * Draws `count` vertices (or indices) from `first`; the VAO must be bound.
   * @param {WebGL2RenderingContext} gl @param {number} first @param {number} count
   */
  draw(gl, first, count) {
    if (this.indexBytes)
      gl.drawElements(gl.TRIANGLES, count, this.indexType, first * this.indexBytes);
    else gl.drawArrays(gl.TRIANGLES, first, count);
  }

  /** @param {WebGL2RenderingContext} gl */
  dispose(gl) {
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.buffer);
    if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
  }
}

/**
 * Textured quad in world space (posters, whiteboards, plaques, desks).
 */
export class Sprite {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {TexImageSource} image
   * @param {number[]} corners Bottom-left x,y,z then width, height (in the XY plane).
   */
  constructor(gl, image, corners) {
    const [x, y, z, w, h] = corners;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    this.vao = /** @type {WebGLVertexArrayObject} */ (gl.createVertexArray());
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    this.buffer = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      x, y, z, 0, 1,  x + w, y, z, 1, 1,  x + w, y + h, z, 1, 0,
      x, y, z, 0, 1,  x + w, y + h, z, 1, 0,  x, y + h, z, 0, 0,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
    this.bright = 1;
    /** Bounding box (centre, half extents) for culling; the model matrix is the identity. */
    this.box = new Float32Array([x + w / 2, y + h / 2, z, w / 2, h / 2, 0]);
  }

  /** @param {WebGL2RenderingContext} gl */
  dispose(gl) {
    gl.deleteTexture(this.texture);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.buffer);
  }
}

/**
 * @typedef {Object} Lighting
 * @property {number[]} sunDir Direction the light travels (normalised).
 * @property {number[]} sunColor
 * @property {number[]} sky Ambient from above.
 * @property {number[]} ground Ambient from below.
 * @property {number[]} fog
 * @property {[number, number]} fogRange
 * @property {{top: number[], mid: number[], bottom: number[], sun: [number, number], glow: number[]}} backdrop
 * @property {Array<{pos: number[], radius: number, color: number[]}>} lights
 *
 * @typedef {Object} DrawItem
 * @property {Mesh} mesh
 * @property {Float32Array} model
 * @property {number} [rim]
 * @property {number[]} [tint]
 * @property {boolean} [noShadow]
 */

/** Stage build timings, reported by the scene for the `?perf` overlay. */
export const perfStats = {
  /** Milliseconds from the start of a stage build until everything is ready. */
  buildMs: 0,
  /** Of which the main thread was busy (the rest ran in a worker or waited on files). */
  mainMs: 0,
};

/**
 * `?perf`: frame rate, frame and script time, draw calls, triangles and the
 * renderer's quality settings, refreshed twice a second in a corner of the page.
 */
class PerfOverlay {
  /** @param {Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    const el = document.createElement('pre');
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position: 'fixed',
      left: '50%',
      top: '4px',
      transform: 'translateX(-50%)',
      zIndex: '99',
      margin: '0',
      padding: '4px 8px',
      font: '12px/1.35 ui-monospace, monospace',
      color: '#e8ffe0',
      background: 'rgba(0, 0, 0, 0.65)',
      borderRadius: '6px',
      pointerEvents: 'none',
    });
    document.body.append(el);
    this.el = el;
    this.last = performance.now();
    this.since = this.last;
    this.frames = 0;
    this.frameMs = 0;
    this.worst = 0;
    this.scriptMs = 0;
    this.draws = 0;
    this.shadowDraws = 0;
    this.triangles = 0;
  }

  reset() {
    this.frames = 0;
    this.frameMs = 0;
    this.worst = 0;
    this.scriptMs = 0;
    this.draws = 0;
    this.shadowDraws = 0;
    this.triangles = 0;
  }

  /**
   * Called at the end of every rendered frame.
   * @param {number} start When render() began (its CPU time is what is shown as JS).
   */
  frame(start) {
    const now = performance.now();
    const dt = now - this.last;
    this.last = now;
    const st = this.renderer.stats;
    this.frames++;
    this.frameMs += dt;
    if (dt > this.worst) this.worst = dt;
    this.scriptMs += Math.max(0, now - start);
    this.draws += st.draws;
    this.shadowDraws += st.shadowDraws;
    this.triangles += st.triangles;
    if (now - this.since < 500) return;
    this.since = now;
    const n = this.frames;
    const r = this.renderer;
    this.el.textContent =
      `${((1000 * n) / this.frameMs).toFixed(0)} fps · ${(this.frameMs / n).toFixed(1)} ms ` +
      `(max ${this.worst.toFixed(1)}) · render JS ${(this.scriptMs / n).toFixed(2)} ms\n` +
      `draws ${(this.draws / n).toFixed(0)} · shadow ${(this.shadowDraws / n).toFixed(0)} · ` +
      `${(this.triangles / n / 1000).toFixed(0)}k tris\n` +
      `scale ${r.scale.toFixed(2)} · shadow map ${r.shadowSize} · AO ${r.low ? 'off' : 'on'}\n` +
      `build ${perfStats.buildMs.toFixed(0)} ms (main thread ${perfStats.mainMs.toFixed(0)} ms)`;
    this.reset();
  }
}

/**
 * WebGL2 forward renderer: sky gradient, shadow-mapped sun, point lights,
 * per-vertex AO, ACES tonemapping. Draws at the full device pixel ratio.
 */
export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 indisponible');
    this.gl = gl;
    this.canvas = canvas;
    this.main = program(gl, MAIN_VS, MAIN_FS);
    this.depth = program(gl, DEPTH_VS, DEPTH_FS);
    this.sky = program(gl, SKY_VS, SKY_FS);
    this.spriteProg = program(gl, SPRITE_VS, SPRITE_FS);
    this.skyVao = gl.createVertexArray();
    // Sampler units never change: the shadow map on unit 0, sprite art on unit 1.
    gl.useProgram(this.main.p);
    gl.uniform1i(this.main.u.uShadow, 0);
    gl.uniform1f(this.main.u.uAO, 1);
    gl.useProgram(this.spriteProg.p);
    gl.uniform1i(this.spriteProg.u.uTex, 1);
    /** Render scale (dynamic resolution), 0.5–1. */
    this.scale = 1;
    const params = new URLSearchParams(location.search);
    /** Touch devices trade shadow detail and corner occlusion for frame rate. */
    this.touch = matchMedia('(pointer: coarse)').matches;
    /** Half-size shadow map and no corner occlusion (see lowQuality()). */
    this.low = false;
    // Phones get a lighter shadow map.
    this.shadowSize = this.touch ? 1024 : 2048;
    /** @type {WebGLTexture | null} */
    this.shadowTex = null;
    this.shadowFbo = gl.createFramebuffer();
    this.shadowMap(this.shadowSize);
    /** Draw calls of the last frame, camera and shadow passes, and triangles drawn. */
    this.stats = { draws: 0, shadowDraws: 0, triangles: 0 };
    /** `?perf` shows frame timings and draw counts in a corner. */
    this.perf = params.has('perf') ? new PerfOverlay(this) : null;
    if (params.get('perf') === 'low') this.lowQuality();
    this.width = 1;
    this.height = 1;
    // Per-frame scratch storage: render() allocates nothing.
    this.lightProj = ortho(-22, 22, -16, 16, 1, 90);
    this.lightView = new Float32Array(16);
    this.lightVP = new Float32Array(16);
    this.lightEye = new Float64Array(3);
    this.lightTarget = new Float64Array(3);
    this.viewPlanes = new Float64Array(16);
    this.shadowPlanes = new Float64Array(16);
    this.lightPos = new Float32Array(32);
    this.lightColor = new Float32Array(24);
    /** Indices and distances of the nearest point lights, sorted by distance. */
    this.nearIdx = new Int32Array(8);
    this.nearDist = new Float64Array(8);
    /** The canvas size in CSS pixels, kept up to date without forcing layouts. */
    this.cssWidth = canvas.clientWidth;
    this.cssHeight = canvas.clientHeight;
    /** @type {ResizeObserver | null} */
    this.observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => {
        // Layout is fresh inside the callback: these reads cost nothing.
        this.cssWidth = canvas.clientWidth;
        this.cssHeight = canvas.clientHeight;
      });
      this.observer.observe(canvas);
    }
    this.resize();
  }

  /**
   * (Re)creates the sun's depth texture at `size` texels square.
   * @param {number} size
   */
  shadowMap(size) {
    const gl = this.gl;
    if (this.shadowTex) gl.deleteTexture(this.shadowTex);
    this.shadowSize = size;
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Lighter rendering for a struggling device, for the rest of the session: half the
   * shadow map's texels and no corner occlusion. Switching back and forth would
   * hitch, so it is one way.
   */
  lowQuality() {
    if (this.low) return;
    this.low = true;
    this.shadowMap(this.shadowSize / 2);
    const gl = this.gl;
    gl.useProgram(this.main.p);
    gl.uniform1f(this.main.u.uAO, 0);
  }

  resize() {
    // On a touch device, frames slow enough for the dynamic resolution to step down
    // (see DynamicResolution) also lighten the shadows and occlusion.
    if (this.touch && !this.low && this.scale < 1) this.lowQuality();
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.scale;
    // Reading clientWidth forces a layout whenever the HUD changed the page, so it
    // is cached and refreshed by the resize observer (when there is one).
    const cw = this.observer ? this.cssWidth : this.canvas.clientWidth;
    const ch = this.observer ? this.cssHeight : this.canvas.clientHeight;
    const w = Math.max(1, Math.round(cw * dpr));
    const h = Math.max(1, Math.round(ch * dpr));
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = w;
    this.height = h;
  }

  /**
   * @param {{viewProj: Float32Array, eye: number[], focus: number[]}} camera
   * @param {Lighting} lit
   * @param {DrawItem[]} items
   * @param {Sprite[]} sprites
   * @param {{flash?: number}} [fx]
   */
  render(camera, lit, items, sprites, fx = NO_FX) {
    const start = this.perf ? performance.now() : 0;
    const gl = this.gl;
    this.resize();
    // Sun shadow map centred on what the camera looks at.
    const fx0 = camera.focus[0],
      fy0 = camera.focus[1];
    const d = lit.sunDir;
    const eye = this.lightEye;
    eye[0] = fx0 - d[0] * 40;
    eye[1] = fy0 - d[1] * 40;
    eye[2] = -d[2] * 40;
    const target = this.lightTarget;
    target[0] = fx0;
    target[1] = fy0;
    target[2] = 0;
    const lightVP = multiply(
      this.lightProj,
      lookAt(eye, target, undefined, this.lightView),
      this.lightVP,
    );
    extractPlanes(lightVP, this.shadowPlanes);
    extractPlanes(camera.viewProj, this.viewPlanes);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 4);
    gl.useProgram(this.depth.p);
    gl.uniformMatrix4fv(this.depth.u.uLightVP, false, lightVP);
    const uDepthModel = this.depth.u.uModel;
    const sunDir = lit.sunDir;
    /** @type {WebGLVertexArrayObject | null} */
    let vao = null;
    /** @type {Float32Array | null} */
    let model = null;
    let draws = 0,
      shadowDraws = 0,
      indices = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.noShadow) continue;
      const mesh = it.mesh;
      if (tooSmall(it.model, mesh.box)) continue;
      if (!visible(it.model, mesh.box, this.shadowPlanes, SHADOW_MARGIN)) continue;
      if (it.model !== model) gl.uniformMatrix4fv(uDepthModel, false, (model = it.model));
      if (mesh.vao !== vao) gl.bindVertexArray((vao = mesh.vao));
      const parts = mesh.parts;
      if (!parts) {
        mesh.draw(gl, 0, mesh.count);
        shadowDraws++;
        continue;
      }
      const lean = sameSun(mesh.sun, sunDir);
      for (let k = 0; k < parts.length; k++) {
        const p = parts[k];
        if (!visible(it.model, p.box, this.shadowPlanes, SHADOW_MARGIN)) continue;
        if (!lean) mesh.draw(gl, p.first, p.total);
        else if (p.shadowCount) mesh.draw(gl, p.shadowFirst, p.shadowCount);
        else continue;
        shadowDraws++;
      }
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const m = this.main;
    gl.useProgram(m.p);
    gl.uniformMatrix4fv(m.u.uViewProj, false, camera.viewProj);
    gl.uniformMatrix4fv(m.u.uLightVP, false, lightVP);
    gl.uniform3fv(m.u.uSunDir, lit.sunDir);
    gl.uniform3fv(m.u.uSunColor, lit.sunColor);
    gl.uniform3fv(m.u.uSky, lit.sky);
    gl.uniform3fv(m.u.uGround, lit.ground);
    gl.uniform3fv(m.u.uFog, lit.fog);
    gl.uniform1f(m.u.uFogNear, lit.fogRange[0]);
    gl.uniform1f(m.u.uFogFar, lit.fogRange[1]);
    gl.uniform3fv(m.u.uEye, camera.eye);
    gl.uniform1f(m.u.uFlash, fx.flash ?? 0);
    gl.uniform2f(m.u.uInvSize, 1 / this.width, 1 / this.height);
    this.uploadLights(lit.lights, fx0, fy0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    const uModel = m.u.uModel,
      uRim = m.u.uRim,
      uTint = m.u.uTint;
    const planes = this.viewPlanes;
    vao = null;
    model = null;
    let rim = NaN;
    let tr = NaN,
      tg = NaN,
      tb = NaN;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const mesh = it.mesh;
      if (!visible(it.model, mesh.box, planes, VIEW_MARGIN)) continue;
      if (it.model !== model) gl.uniformMatrix4fv(uModel, false, (model = it.model));
      const r = it.rim ?? 0;
      if (r !== rim) gl.uniform1f(uRim, (rim = r));
      const t = it.tint ?? WHITE;
      if (t[0] !== tr || t[1] !== tg || t[2] !== tb) {
        tr = t[0];
        tg = t[1];
        tb = t[2];
        gl.uniform3fv(uTint, t);
      }
      if (mesh.vao !== vao) gl.bindVertexArray((vao = mesh.vao));
      const parts = mesh.parts;
      if (!parts) {
        mesh.draw(gl, 0, mesh.count);
        draws++;
        indices += mesh.count;
        continue;
      }
      for (let k = 0; k < parts.length; k++) {
        const p = parts[k];
        if (p.count && visible(it.model, p.box, planes, VIEW_MARGIN)) {
          mesh.draw(gl, p.first, p.count);
          draws++;
          indices += p.count;
        }
      }
    }

    const sp = this.spriteProg;
    gl.useProgram(sp.p);
    gl.uniformMatrix4fv(sp.u.uViewProj, false, camera.viewProj);
    gl.uniform3fv(sp.u.uFog, lit.fog);
    gl.uniform3fv(sp.u.uEye, camera.eye);
    gl.uniform1f(sp.u.uFogNear, lit.fogRange[0]);
    gl.uniform1f(sp.u.uFogFar, lit.fogRange[1]);
    gl.activeTexture(gl.TEXTURE1);
    let bright = NaN;
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      if (!visible(IDENTITY, s.box, planes, 0.5)) continue;
      if (s.bright !== bright) gl.uniform1f(sp.u.uBright, (bright = s.bright));
      gl.bindTexture(gl.TEXTURE_2D, s.texture);
      gl.bindVertexArray(s.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      draws++;
      indices += 6;
    }

    // The backdrop last, only where nothing was drawn (it sits behind everything).
    gl.depthMask(false);
    gl.useProgram(this.sky.p);
    const b = lit.backdrop;
    gl.uniform3fv(this.sky.u.uTop, b.top);
    gl.uniform3fv(this.sky.u.uMid, b.mid);
    gl.uniform3fv(this.sky.u.uBottom, b.bottom);
    gl.uniform2fv(this.sky.u.uSun, b.sun);
    gl.uniform3fv(this.sky.u.uSunGlow, b.glow);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);

    gl.bindVertexArray(null);
    const st = this.stats;
    st.draws = draws + 1;
    st.shadowDraws = shadowDraws;
    st.triangles = (indices + 3) / 3;
    if (this.perf) this.perf.frame(start);
  }

  /**
   * Uploads the point lights; the shader takes 8, so keep the ones nearest to
   * what the camera looks at (stable order on ties, like a stable sort).
   * @param {Lighting['lights']} all
   * @param {number} fx0
   * @param {number} fy0
   */
  uploadLights(all, fx0, fy0) {
    const gl = this.gl;
    const u = this.main.u;
    const idx = this.nearIdx,
      dist = this.nearDist;
    let n = 0;
    if (all.length <= 8) {
      n = all.length;
      for (let i = 0; i < n; i++) idx[i] = i;
    } else {
      for (let i = 0; i < all.length; i++) {
        const p = all[i].pos;
        const dd = Math.hypot(p[0] - fx0, p[1] - fy0);
        if (n === 8 && !(dd < dist[7])) continue;
        let j = n < 8 ? n++ : 7;
        while (j > 0 && dist[j - 1] > dd) {
          dist[j] = dist[j - 1];
          idx[j] = idx[j - 1];
          j--;
        }
        dist[j] = dd;
        idx[j] = i;
      }
    }
    gl.uniform1i(u.uLights, n);
    if (!n) return;
    const pos = this.lightPos,
      col = this.lightColor;
    for (let k = 0; k < n; k++) {
      const l = all[idx[k]];
      pos[k * 4] = l.pos[0];
      pos[k * 4 + 1] = l.pos[1];
      pos[k * 4 + 2] = l.pos[2];
      pos[k * 4 + 3] = l.radius;
      col[k * 3] = l.color[0];
      col[k * 3 + 1] = l.color[1];
      col[k * 3 + 2] = l.color[2];
    }
    gl.uniform4fv(u.uLightPos, pos, 0, n * 4);
    gl.uniform3fv(u.uLightColor, col, 0, n * 3);
  }
}

export { identity };
