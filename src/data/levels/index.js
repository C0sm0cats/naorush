import { LCP7 } from './lcp7.js';
import { ROOFTOP } from './rooftop.js';
import { TS } from './ts.js';

/**
 * The three stages of NAO Rush, in play order.
 *
 * Maps are rows of tiles written top to bottom; rooms are 20 tiles wide.
 *   '#' structure      'M' meeting room   'B' paper reams   'V' server rack   'H' HVAC unit
 *   '-' loose floor    '^' live cables    'G' arena gate (closes during a boss fight)
 *   'S' start          'C' Chronotime badge (checkpoint)    '$' Swile ticket
 *   'p' badge reader (opens the doors)   'D' door           'K' signed purchase order
 *   'F' ceiling panel that falls         'R' rolling water-cooler bottle
 *   'n' colleague in a call              'a' ream of paper (+3 CR)
 *   'X' level boss     'E' exit (needs the purchase order)
 *
 * @typedef {Object} Decor
 * @property {'whiteboard'|'poster'|'desk'|import('../../gfx/props.js').PropId} type
 * @property {string} [id]
 * @property {number} x Tile column (left edge; props: centre).
 * @property {number} y Tile row from the bottom (floor height).
 * @property {number} [z] Depth of a prop (default: against the back wall).
 * @property {boolean} [front] Hung on the front face of a block instead of the back wall.
 *
 * @typedef {{who: 'hero'|'partner'|'boss'|'hint', text: string}} Line
 *
 * @typedef {Object} Lighting
 * @property {number[]} sunDir
 * @property {number[]} sunColor
 * @property {number[]} sky
 * @property {number[]} ground
 * @property {number[]} fog
 * @property {[number, number]} fogRange
 * @property {{top: number[], mid: number[], bottom: number[], sun: [number, number], glow: number[]}} backdrop
 *
 * @typedef {import('../../game/sim.js').LevelDef & {
 *   id: string,
 *   theme: 'office'|'datacenter'|'rooftop',
 *   music: 'office'|'datacenter'|'rooftop',
 *   name: string,
 *   subtitle: string,
 *   rooms: string[],
 *   decor: Decor[],
 *   lighting: Lighting,
 *   intro: Line[],
 *   bossIntro?: Line[],
 *   outro: Line[],
 * }} Level
 */

export const ROOM_W = 20;

/** @type {Level[]} */
export const LEVELS = [LCP7, TS, ROOFTOP];
