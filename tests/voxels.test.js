import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/data/levels/index.js';
import { TILE, createSim } from '../src/game/sim.js';
import { MeshBuilder } from '../src/gfx/geometry.js';
import { PROP_IDS, PROP_VARIANTS, propGeometry } from '../src/gfx/props.js';
import {
  MAT,
  STRIDE,
  Volume,
  indexVertices,
  meshVolume,
  partitionMesh,
} from '../src/gfx/voxels.js';
import {
  PALETTE,
  V,
  buildForeground,
  buildOffice,
  floorPlan,
  signLabel,
} from '../src/gfx/world-builder.js';

/** A small room-like volume: floor, back wall, a desk and scattered blocks. */
function sampleVolume() {
  const v = new Volume(40, 12, 10, 0.5, [0, 0, -3]);
  v.box(0, 0, 0, 40, 1, 10, 0x445566);
  v.box(0, 0, 0, 40, 12, 1, (x, y) => ((x + y) % 3 ? 0xddccbb : 0xccbbaa));
  v.box(5, 1, 3, 12, 4, 6, 0x8a6a4a, MAT.GLOSSY);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 120; i++)
    v.set(
      Math.floor(rnd() * 40),
      1 + Math.floor(rnd() * 10),
      1 + Math.floor(rnd() * 8),
      rnd() < 0.5 ? 0xff0000 : 0x00ff00,
      rnd() < 0.2 ? MAT.EMISSIVE : MAT.MATTE,
    );
  return v;
}

/** Vertex `i` of an interleaved buffer: position and normal. @param {ArrayBuffer} data @param {number} i */
function vertex(data, i) {
  const f = new Float32Array(data, i * STRIDE, 3);
  const n = new Int8Array(data, i * STRIDE + 12, 3);
  return { p: [...f], n: [...n] };
}

describe('voxel meshing', () => {
  it('emits one quad per exposed side and merges equal neighbours', () => {
    const one = new Volume(1, 1, 1, 1);
    one.set(0, 0, 0, 0xffffff);
    expect(meshVolume(one).count).toBe(36);
    const bar = new Volume(4, 1, 1, 1);
    bar.box(0, 0, 0, 4, 1, 1, 0x123456);
    // Four long sides plus two ends, all merged into single quads.
    expect(meshVolume(bar).count).toBe(36);
  });

  it('fills boxes like set() does, with plain colours and patterns', () => {
    const a = new Volume(9, 7, 5, 1);
    const b = new Volume(9, 7, 5, 1);
    /** @param {number} x @param {number} y @param {number} z */
    const pattern = (x, y, z) => (x * 7 + y * 3 + z) * 0x10101;
    a.box(-2, 1, 1, 12, 5, 4, pattern, MAT.GLOSSY);
    a.box(2, 0, 0, 4, 7, 5, 0xabcdef);
    a.box(3, 2, 1, 5, 4, 3, 0, MAT.EMPTY);
    for (let z = 1; z < 4; z++)
      for (let y = 1; y < 5; y++)
        for (let x = 0; x < 9; x++) b.set(x, y, z, pattern(x, y, z), MAT.GLOSSY);
    for (let z = 0; z < 5; z++)
      for (let y = 0; y < 7; y++) for (let x = 2; x < 4; x++) b.set(x, y, z, 0xabcdef);
    for (let z = 1; z < 3; z++)
      for (let y = 2; y < 4; y++) for (let x = 3; x < 5; x++) b.set(x, y, z, 0, MAT.EMPTY);
    expect([...a.data]).toEqual([...b.data]);
  });

  it('indexes vertices without changing a single triangle', () => {
    const geo = meshVolume(sampleVolume());
    const ix = indexVertices(geo);
    expect(ix.count).toBe(geo.count);
    expect(ix.vertices).toBeLessThan(geo.count);
    const src = new Uint32Array(geo.data);
    const out = new Uint32Array(ix.data);
    const W = STRIDE / 4;
    for (let i = 0; i < geo.count; i++)
      for (let k = 0; k < W; k++) expect(out[ix.index[i] * W + k]).toBe(src[i * W + k]);
  });

  it('builds smooth meshes as indexed geometry', () => {
    const b = new MeshBuilder().roundedBox([0, 0, 0], [1, 1, 1], 0.3, '#ff8800');
    const geo = b.build();
    expect(geo.count).toBe(b.mat.length);
    expect(geo.vertices).toBeLessThan(geo.count / 2);
  });

  it('partitions into bands whose passes keep only usable faces', () => {
    const sun = [0.3, -0.8, 0.5];
    const geo = meshVolume(sampleVolume());
    const part = partitionMesh(geo, 4, sun);
    expect(part.parts.length).toBeGreaterThan(2);
    // Every quad survives except those facing both away from the camera and the sun.
    let dropped = 0;
    for (let q = 0; q < geo.count; q += 6) {
      const { n } = vertex(geo.data, q);
      if (n[2] < 0 && n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2] > 0) dropped += 6;
    }
    expect(part.count).toBe(geo.count - dropped);
    for (const p of part.parts) {
      for (let i = p.first; i < p.first + p.total; i++) {
        const { p: pos, n } = vertex(part.data, part.index[i]);
        const inCamera = i < p.first + p.count;
        const inShadow = i >= p.shadowFirst && i < p.shadowFirst + p.shadowCount;
        expect(inCamera || inShadow).toBe(true);
        if (inCamera) expect(n[2]).toBeGreaterThanOrEqual(0);
        if (inShadow) expect(n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]).toBeLessThanOrEqual(0);
        for (let k = 0; k < 3; k++)
          expect(Math.abs(pos[k] - p.box[k])).toBeLessThanOrEqual(p.box[k + 3] + 1e-5);
      }
    }
  });
});

describe('set dressing', () => {
  /** @param {import('../src/data/levels/index.js').Level} l */
  const build = (l) => buildOffice(createSim(l, 'kevin'), l.decor, l.map, l.theme);

  it('gives every free-standing platform a deck with the lime nosing of a floor', () => {
    for (const l of LEVELS) {
      const sim = createSim(l, 'kevin');
      const { vol } = build(l);
      const at = (/** @type {number} */ c, /** @type {number} */ r) =>
        c < 0 || c >= sim.w || r < 0 || r >= sim.h ? TILE.SOLID : sim.tiles[c + r * sim.w];
      for (let r = 2; r < sim.h - 1; r++)
        for (let c = 0; c < sim.w; c++) {
          if (at(c, r) !== TILE.SOLID || l.map[sim.h - 1 - r][c] !== '#') continue;
          if (
            at(c, r + 1) === TILE.SOLID ||
            at(c, r - 1) === TILE.SOLID ||
            at(c, r - 1) === TILE.HAZARD
          )
            continue;
          if (l.theme === 'rooftop') continue;
          const v = vol.get(c * V + 4, r * V + V - 2, vol.sz - 1);
          expect((v & 0xffffff).toString(16), `${l.id} ${c},${r}`).toBe(
            PALETTE.accent.toString(16),
          );
        }
    }
  });

  it('keeps foreground silhouettes below the floor line, on solid floor', () => {
    for (const l of LEVELS) {
      const sim = createSim(l, 'kevin');
      const plan = floorPlan(sim, l.map, l.decor, () => false, []);
      const traps = new Set();
      l.map.forEach((row) => [...row].forEach((ch, c) => ch === 'L' && traps.add(c)));
      const fg = buildForeground(plan, l.mood ?? 'morning', traps);
      if (!fg) continue;
      for (let x = 0; x < fg.sx; x++)
        for (let y = 0; y < fg.sy; y++)
          for (let z = 0; z < fg.sz; z++) {
            if (!fg.get(x, y, z)) continue;
            expect(y, l.id).toBeLessThan(plan.F + 2);
            expect(plan.ground[x >> 3], `${l.id} column ${x >> 3}`).toBe(plan.base);
            expect(traps.has(x >> 3)).toBe(false);
          }
    }
  });

  it('dims the foreground objects in their own colours, never to near-black', () => {
    for (const l of LEVELS) {
      const sim = createSim(l, 'kevin');
      const plan = floorPlan(sim, l.map, l.decor, () => false, []);
      const fg = buildForeground(plan, l.mood ?? 'morning', new Set());
      if (!fg) continue;
      let sum = 0,
        n = 0;
      for (let i = 0; i < fg.data.length; i++) {
        const v = fg.data[i];
        if (!v) continue;
        sum += 0.3 * ((v >> 16) & 255) + 0.59 * ((v >> 8) & 255) + 0.11 * (v & 255);
        n++;
      }
      expect(sum / n, l.id).toBeGreaterThan(48);
    }
  });

  it('clads tall walls instead of leaving blank slabs', () => {
    for (const l of LEVELS) {
      if (l.theme === 'rooftop') continue;
      const sim = createSim(l, 'kevin');
      const { vol } = build(l);
      const at = (/** @type {number} */ c, /** @type {number} */ r) =>
        c < 0 || c >= sim.w || r < 0 || r >= sim.h ? TILE.SOLID : sim.tiles[c + r * sim.w];
      for (let r = 2; r < sim.h - 3; r++)
        for (let c = 1; c < sim.w - 2; c++) {
          // A 2×2 block of plain wall tiles shows panel joints on its front face.
          const block = [0, 1].every((dc) =>
            [0, 1].every(
              (dr) =>
                at(c + dc, r + dr) === TILE.SOLID &&
                l.map[sim.h - 1 - r - dr][c + dc] === '#' &&
                at(c + dc, r + dr - 1) === TILE.SOLID,
            ),
          );
          if (!block) continue;
          /** @type {number[]} */
          const lum = [];
          for (let x = c * V; x < (c + 2) * V; x++)
            for (let y = r * V; y < (r + 2) * V - 3; y++) {
              const v = vol.get(x, y, vol.sz - 1);
              lum.push(0.3 * ((v >> 16) & 255) + 0.59 * ((v >> 8) & 255) + 0.11 * (v & 255));
            }
          const median = [...lum].sort((a, b) => a - b)[lum.length >> 1];
          const joints = lum.filter((v) => v < median * 0.85).length;
          expect(joints, `${l.id} ${c},${r}`).toBeGreaterThanOrEqual(4);
        }
    }
  });

  it('names every room on its hanging sign, short enough to fit', () => {
    for (const l of LEVELS)
      for (const name of l.rooms) {
        const label = signLabel(name, 52);
        expect(label, `${l.id} ${name}`).toMatch(/^[A-Z0-9&’.\- ]+$/);
      }
    expect(signLabel('Coin imprimantes', 52)).toBe('IMPRIMANTES');
    expect(signLabel('Baby-foot', 52)).toBe('BABY-FOOT');
    expect(signLabel('', 52)).toBe('');
  });

  it('dresses the break room with its table football and vending machines', () => {
    const pause = LEVELS.find((l) => l.id === 'pause');
    if (!pause) throw new Error('pause');
    const types = pause.decor.map((d) => d.type);
    expect(types.some((t) => t === 'vendingSnack' || t === 'vendingDrink')).toBe(true);
    // Its free-standing 2×3 blocks are drawn as vending machines: a lit header on top.
    const sim = createSim(pause, 'kevin');
    const { vol } = build(pause);
    let machines = 0;
    for (let c = 1; c < sim.w - 2; c++)
      for (let r = 1; r < sim.h - 3; r++) {
        const v = vol.get(c * V + 4, (r + 3) * V - 2, vol.sz - 1);
        if (v >>> 24 === MAT.EMISSIVE && pause.map[sim.h - 1 - r][c] === '#') machines++;
      }
    expect(machines).toBeGreaterThan(0);
    for (const id of ['babyFoot', 'vendingSnack', 'vendingDrink'])
      expect(propGeometry(/** @type {any} */ (id)).count).toBeGreaterThan(0);
  });

  it('offers five large and three small plants, every prop within its vertex budget', () => {
    expect(PROP_VARIANTS.plant).toHaveLength(5);
    expect(PROP_VARIANTS.plantSmall).toHaveLength(3);
    for (const id of PROP_IDS) {
      const g = /** @type {{vertices: number}} */ (/** @type {unknown} */ (propGeometry(id)));
      expect(g.vertices, id).toBeLessThan(6000);
    }
  });

  it('stands every decor prop on a floor, clear of the walls', () => {
    /** Extent of a model. @param {string} id */
    const extent = (id) => {
      const g = propGeometry(/** @type {any} */ (id));
      const d = new DataView(g.data);
      const lo = [Infinity, Infinity, Infinity],
        hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < g.data.byteLength / STRIDE; i++)
        for (let k = 0; k < 3; k++) {
          const v = d.getFloat32(i * STRIDE + k * 4, true);
          lo[k] = Math.min(lo[k], v);
          hi[k] = Math.max(hi[k], v);
        }
      return { lo, hi };
    };
    const hung = new Set(['projector', 'truss']);
    for (const l of LEVELS) {
      const h = l.map.length;
      const at = (/** @type {number} */ c, /** @type {number} */ r) =>
        r < 0 || r >= h ? '#' : (l.map[h - 1 - r][c] ?? '#');
      for (const d of l.decor) {
        if (['poster', 'whiteboard', 'desk'].includes(d.type) || hung.has(d.type)) continue;
        // Spotlights clamped to a truss hang between whole rows.
        if (d.type === 'spotlight' && d.y % 1) continue;
        // The widest look-alike, whichever variant is drawn.
        const ids = PROP_VARIANTS[/** @type {keyof typeof PROP_VARIANTS} */ (d.type)] ?? [d.type];
        const boxes = ids.map(extent);
        const x0 = d.x + Math.min(...boxes.map((b) => b.lo[0])),
          x1 = d.x + Math.max(...boxes.map((b) => b.hi[0])),
          y1 = d.y + Math.max(...boxes.map((b) => b.hi[1]));
        const tag = `${l.id} ${d.type} x${d.x} y${d.y}`;
        expect(Math.abs(d.y - Math.round(d.y)), `${tag}: hauteur`).toBeLessThan(0.01);
        // Nothing in a solid tile, a crate, a parked car or a meeting table.
        for (let c = Math.floor(x0 + 0.05); c <= Math.floor(x1 - 0.05); c++)
          for (let r = Math.floor(d.y + 0.05); r <= Math.floor(y1 - 0.05); r++)
            expect('#MBVHQYA'.includes(at(c, r)), `${tag}: ${at(c, r)} en ${c},${r}`).toBe(false);
        // Nothing hangs over the void: floor under the whole footprint.
        for (let x = x0 - 0.05; x <= x1 + 0.05; x += 0.05)
          expect(
            '#MBVHQY'.includes(at(Math.floor(x), d.y - 1)),
            `${tag}: vide sous x ${x.toFixed(2)}`,
          ).toBe(true);
      }
    }
  });

  it('draws the parked car one tile tall and four long, wheels on the floor', () => {
    const g = propGeometry('carBlue');
    const d = new DataView(g.data);
    const lo = [Infinity, Infinity],
      hi = [-Infinity, -Infinity];
    for (let i = 0; i < g.data.byteLength / STRIDE; i++)
      for (let k = 0; k < 2; k++) {
        const v = d.getFloat32(i * STRIDE + k * 4, true);
        lo[k] = Math.min(lo[k], v);
        hi[k] = Math.max(hi[k], v);
      }
    expect(lo[1]).toBeCloseTo(0, 3);
    expect(hi[1]).toBeCloseTo(1, 3);
    expect(hi[0] - lo[0]).toBeGreaterThan(3.9);
    expect(hi[0] - lo[0]).toBeLessThanOrEqual(4.02);
  });
});
