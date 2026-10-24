import { STRIDE } from './voxels.js';
import { identity, lookAt, multiply, ortho } from './mat4.js';

/** Extra room (world units / tiles) kept around the camera view before an item is culled. */
const VIEW_MARGIN = 6;
/** Extra room around the sun's shadow box before an item is left out of the shadow map. */
const SHADOW_MARGIN = 2;
const WHITE = new Float32Array([1, 1, 1]);
/** @type {{flash?: number}} */
const NO_FX = {};

/**
 * Bounding radius around the mesh origin, from the interleaved vertex positions.
 * @param {{data: ArrayBuffer | ArrayBufferView, count: number}} geo
 */
function meshRadius(geo) {
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
  if (!buf || STRIDE % 4) return Infinity;
  const f = new Float32Array(buf, off, len >> 2);
  const step = STRIDE / 4;
  const n = Math.min(geo.count, Math.floor(f.length / step));
  let r2 = 0;
  for (let i = 0, o = 0; i < n; i++, o += step) {
    const x = f[o],
      y = f[o + 1],
      z = f[o + 2];
    const q = x * x + y * y + z * z;
    if (q > r2) r2 = q;
  }
  return Number.isFinite(r2) ? Math.sqrt(r2) : Infinity;
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
 * Conservative visibility test: the item's bounding sphere against four clip planes.
 * Items placed at the world origin (office shell, skyline, diorama) are never culled.
 * @param {DrawItem} it
 * @param {Float64Array} planes
 * @param {number} margin
 */
function visible(it, planes, margin) {
  const m = it.model;
  const x = m[12],
    y = m[13],
    z = m[14];
  if (x === 0 && y === 0 && z === 0) return true;
  const r = it.mesh.radius;
  if (!(r < Infinity)) return true;
  const s2 = Math.max(
    m[0] * m[0] + m[1] * m[1] + m[2] * m[2],
    m[4] * m[4] + m[5] * m[5] + m[6] * m[6],
    m[8] * m[8] + m[9] * m[9] + m[10] * m[10],
  );
  const reach = -(r * Math.sqrt(s2) + margin);
  for (let i = 0; i < 16; i += 4)
    if (planes[i] * x + planes[i + 1] * y + planes[i + 2] * z + planes[i + 3] < reach) return false;
  return true;
}

const MAIN_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aColor;
layout(location=3) in float aMat;
uniform mat4 uModel, uViewProj, uLightVP;
out vec3 vColor, vNormal, vWorld;
out vec4 vLight;
out float vAO, vMat;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vColor = aColor.rgb;
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
uniform vec3 uSunDir, uSunColor, uSky, uGround, uFog, uEye, uTint;
uniform float uFogNear, uFogFar, uRim, uFlash;
uniform int uLights;
uniform vec4 uLightPos[8];
uniform vec3 uLightColor[8];
out vec4 outColor;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
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
  vec3 albedo = toLinear(vColor) * uTint;
  vec3 n = normalize(vNormal);
  int mat = int(vMat + 0.5);
  vec3 col;
  if (mat == 2) {
    col = albedo * 2.2;
  } else {
    float ao = 0.35 + 0.65 * vAO;
    vec3 ambient = mix(uGround, uSky, n.y * 0.5 + 0.5) * ao;
    float ndl = max(dot(n, -uSunDir), 0.0);
    vec3 light = ambient + uSunColor * ndl * shadow();
    for (int i = 0; i < 8; i++) {
      if (i >= uLights) break;
      vec3 d = uLightPos[i].xyz - vWorld;
      float dist = length(d);
      float att = clamp(1.0 - dist / uLightPos[i].w, 0.0, 1.0);
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
  col = mix(col, vec3(1.0, 0.35, 0.3), uFlash);
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
   * @param {{data: ArrayBuffer, count: number}} geo
   */
  constructor(gl, geo) {
    this.count = geo.count;
    /** Bounding radius around the mesh origin (for culling). */
    this.radius = meshRadius(geo);
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
    gl.bindVertexArray(null);
  }

  /** @param {WebGL2RenderingContext} gl */
  dispose(gl) {
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.buffer);
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
    /** Render scale (dynamic resolution), 0.5–1. */
    this.scale = 1;
    // Phones get a lighter shadow map.
    this.shadowSize = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.scale;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
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
    /** @type {WebGLVertexArrayObject | null} */
    let vao = null;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.noShadow || !visible(it, this.shadowPlanes, SHADOW_MARGIN)) continue;
      gl.uniformMatrix4fv(uDepthModel, false, it.model);
      if (it.mesh.vao !== vao) gl.bindVertexArray((vao = it.mesh.vao));
      gl.drawArrays(gl.TRIANGLES, 0, it.mesh.count);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

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
    this.uploadLights(lit.lights, fx0, fy0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(m.u.uShadow, 0);
    const uModel = m.u.uModel,
      uRim = m.u.uRim,
      uTint = m.u.uTint;
    vao = null;
    let rim = NaN;
    let tr = NaN,
      tg = NaN,
      tb = NaN;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!visible(it, this.viewPlanes, VIEW_MARGIN)) continue;
      gl.uniformMatrix4fv(uModel, false, it.model);
      const r = it.rim ?? 0;
      if (r !== rim) gl.uniform1f(uRim, (rim = r));
      const t = it.tint ?? WHITE;
      if (t[0] !== tr || t[1] !== tg || t[2] !== tb) {
        tr = t[0];
        tg = t[1];
        tb = t[2];
        gl.uniform3fv(uTint, t);
      }
      if (it.mesh.vao !== vao) gl.bindVertexArray((vao = it.mesh.vao));
      gl.drawArrays(gl.TRIANGLES, 0, it.mesh.count);
    }

    const sp = this.spriteProg;
    gl.useProgram(sp.p);
    gl.uniformMatrix4fv(sp.u.uViewProj, false, camera.viewProj);
    gl.uniform3fv(sp.u.uFog, lit.fog);
    gl.uniform3fv(sp.u.uEye, camera.eye);
    gl.uniform1f(sp.u.uFogNear, lit.fogRange[0]);
    gl.uniform1f(sp.u.uFogFar, lit.fogRange[1]);
    gl.uniform1i(sp.u.uTex, 1);
    gl.activeTexture(gl.TEXTURE1);
    for (const s of sprites) {
      gl.uniform1f(sp.u.uBright, s.bright);
      gl.bindTexture(gl.TEXTURE_2D, s.texture);
      gl.bindVertexArray(s.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.bindVertexArray(null);
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
