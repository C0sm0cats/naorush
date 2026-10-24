import { COPIL } from './copil.js';
import { INTERCONTRAT } from './intercontrat.js';
import { LCP7 } from './lcp7.js';
import { PARKING } from './parking.js';
import { PAUSE } from './pause.js';
import { ROOFTOP } from './rooftop.js';
import { SEMINAIRE } from './seminaire.js';
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
 *   'n' colleague in a call              'a' ream of paper (+3 CR)   'h' coffee (+1 heart)
 *   'i' intern (hurts; a CR stuns)       'v' robot vacuum (jump on it)   'z' video call (invites)
 *   'c' rolling chair   'd' drawer (wall)   'w' sprinkler (ceiling)   'P' printer (paper)
 *   'L' hidden trapdoor 'O' falling binders   'k' water shut-off (stops the sprinklers)   'J' projector (KPI slides)   '*' secret
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
 * @typedef {{who: 'hero'|'partner'|'boss'|'hint'|'narrator', text: string}} Line
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
 *   theme: 'office'|'datacenter'|'rooftop'|'parking',
 *   music: 'office'|'datacenter'|'rooftop'|'parking'|'copil',
 *   keyLabel: string,
 *   keyModel?: 'key'|'badge'|'envelope',
 *   phaseLine?: string,
 *   finaleLine?: string,
 *   tips?: Array<{x0: number, x1: number, y0?: number, y1?: number, keys: string, touch: string}>,
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
export const LEVELS = [PARKING, LCP7, TS, COPIL, ROOFTOP, INTERCONTRAT, PAUSE, SEMINAIRE];

/** Stages of the story; the ones after are bonus stages, unlocked at the end. */
export const CAMPAIGN = 5;
