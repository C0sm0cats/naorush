/** Every image under assets/, resolved by Vite to a hashed URL. */
const URLS = /** @type {Record<string, string>} */ (
  import.meta.glob('../../assets/**/*.{png,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  })
);

/** @param {string} path Path relative to assets/, e.g. `signage/Whiteboard01.webp`. */
export const assetUrl = (path) => URLS[`../../assets/${path}`];

/**
 * @param {string} path
 * @returns {Promise<HTMLImageElement | null>}
 */
export function loadImage(path) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = assetUrl(path);
  });
}

/**
 * Crops an image so a sprite shows only the artwork, not its transparent margins.
 * @param {HTMLImageElement} img
 * @param {number[]} rect x, y, w, h in source pixels.
 */
export function crop(img, [x, y, w, h]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(
    img,
    x,
    y,
    w,
    h,
    0,
    0,
    w,
    h,
  );
  return c;
}
