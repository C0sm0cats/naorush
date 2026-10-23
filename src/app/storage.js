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
    return value && typeof value === typeof fallback ? value : fallback;
  } catch {
    return fallback;
  }
}

/** @param {string} key @param {unknown} value */
export function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage full or blocked: the game still works, it just won't remember. */
  }
}
