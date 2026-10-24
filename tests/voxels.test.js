import { describe, expect, it } from 'vitest';
import { MeshBuilder } from '../src/gfx/geometry.js';
import {
  MAT,
  STRIDE,
  Volume,
  indexVertices,
  meshVolume,
  partitionMesh,
} from '../src/gfx/voxels.js';

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
