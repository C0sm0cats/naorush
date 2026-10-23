import { STRIDE } from './voxels.js';
import { identity, lookAt, multiply, ortho } from './mat4.js';

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
    this.shadowSize = 2048;
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
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
  render(camera, lit, items, sprites, fx = {}) {
    const gl = this.gl;
    this.resize();
    // Sun shadow map centred on what the camera looks at.
    const [fx0, fy0] = camera.focus;
    const d = lit.sunDir;
    const lightEye = [fx0 - d[0] * 40, fy0 - d[1] * 40, -d[2] * 40];
    const lightVP = multiply(ortho(-22, 22, -16, 16, 1, 90), lookAt(lightEye, [fx0, fy0, 0]));

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 4);
    gl.useProgram(this.depth.p);
    gl.uniformMatrix4fv(this.depth.u.uLightVP, false, lightVP);
    for (const it of items) {
      if (it.noShadow) continue;
      gl.uniformMatrix4fv(this.depth.u.uModel, false, it.model);
      gl.bindVertexArray(it.mesh.vao);
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
    // The shader takes 8 point lights: keep the ones nearest to what the camera looks at.
    const near = (/** @type {{pos: number[]}} */ l) => Math.hypot(l.pos[0] - fx0, l.pos[1] - fy0);
    const lights =
      lit.lights.length > 8
        ? [...lit.lights].sort((a, b) => near(a) - near(b)).slice(0, 8)
        : lit.lights;
    gl.uniform1i(m.u.uLights, lights.length);
    if (lights.length) {
      gl.uniform4fv(
        m.u.uLightPos,
        lights.flatMap((l) => [...l.pos, l.radius]),
      );
      gl.uniform3fv(
        m.u.uLightColor,
        lights.flatMap((l) => l.color),
      );
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(m.u.uShadow, 0);
    for (const it of items) {
      gl.uniformMatrix4fv(m.u.uModel, false, it.model);
      gl.uniform1f(m.u.uRim, it.rim ?? 0);
      gl.uniform3fv(m.u.uTint, it.tint ?? [1, 1, 1]);
      gl.bindVertexArray(it.mesh.vao);
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
}

export { identity };
