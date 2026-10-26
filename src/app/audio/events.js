// Which sound effect each game event plays.

/**
 * Events that reuse another effect, by `type` or by `type:cause` (more specific wins).
 * Every other event plays the effect of the same name.
 * @type {Record<string, string>}
 */
export const EVENT_SFX = {
  throw: 'fire',
  // The sim's 'step' is a short drop's touchdown; running footsteps play 'step' directly.
  step: 'touchdown',
  // A CR bouncing off a director who is not consulting PRIMO.
  'block:boss': 'guard',
  // Julien's supervision follows the hero (rackDrop:tracking): a lock-on, not a tock.
  'telegraph:tracking': 'lockOn',
  // Rodolphe's encores (leap:double, fan:encore, dash:return): the crowd asks for more.
  'telegraph:encore': 'encore',
  // Julien's maintenance window (cables:maintenance): the building's announcement chime.
  'cableWarn:maintenance': 'maintenance',
};

/**
 * Effect name for a game event.
 * @param {{ type: string, cause?: string }} e
 * @returns {string}
 */
export const eventSfx = (e) =>
  (e.cause && EVENT_SFX[`${e.type}:${e.cause}`]) || EVENT_SFX[e.type] || e.type;
