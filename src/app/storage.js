/**
 * Saved data in the browser. Reading never throws: a corrupted entry, or storage
 * blocked by private browsing, falls back to the default.
 */

/**
 * @template T
 * @param {string} key @param {T} fallback
 * @returns {T}
 */
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    const same =
      typeof value === typeof fallback && Array.isArray(value) === Array.isArray(fallback);
    return value !== null && same ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * A saved count (the stage reached): a whole number, never negative. Older saves wrote
 * it with `String()` (`'2'`), later ones with JSON (`2`): both read the same.
 * @param {string} key
 */
export function loadCount(key) {
  const n = load(key, 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** @param {string} key @param {unknown} value */
export function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage full or blocked: the game still works, it just won't remember. */
  }
}
