// Builds a stage's voxel diorama off the main thread (see LevelView): the loading
// screen stays smooth and the artwork is prepared on the main thread meanwhile.
// The code and data are the same as on the main thread, so the meshes are too.
import { LEVELS } from '../data/levels/index.js';
import { createSim } from '../game/sim.js';
import { partitionMesh } from '../gfx/voxels.js';
import { buildOffice, buildSkyline } from '../gfx/world-builder.js';

/**
 * @typedef {{id: number, stage: number, heroId: import('../game/sim.js').HeroId, skyline: number}} BuildRequest
 *   `skyline`: level width whose city skyline to build too (0: none).
 */

// Imported on the main thread too (for its fallback): only listen inside a worker.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope)
  self.onmessage = onRequest;

/** @param {MessageEvent<BuildRequest>} e */
function onRequest(e) {
  const { id, stage, heroId, skyline } = e.data;
  try {
    const built = buildStage(LEVELS[stage], heroId, skyline);
    /** @type {Transferable[]} */
    const transfer = [built.office.data, built.office.index.buffer];
    if (built.skyline) transfer.push(built.skyline.data, built.skyline.index.buffer);
    self.postMessage({ id, ...built }, { transfer });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
}

/**
 * The static diorama of a stage, partitioned for culling, and optionally the skyline.
 * Shared with the main thread's fallback, so both paths build exactly the same.
 * @param {import('../data/levels/index.js').Level} level
 * @param {import('../game/sim.js').HeroId} heroId
 * @param {number} skyline
 */
export function buildStage(level, heroId, skyline) {
  const sim = createSim(level, heroId);
  const office = buildOffice(sim, level.decor, level.map, level.theme);
  return {
    lights: office.lights,
    // Bands of 8 tiles, culled one by one; faces no pass can see are dropped.
    office: partitionMesh(office.mesh, 8, level.lighting.sunDir),
    // Bands of 12 units: only the part seen through the windows is drawn. No shadow.
    skyline: skyline ? partitionMesh(buildSkyline(skyline), 12) : null,
  };
}
