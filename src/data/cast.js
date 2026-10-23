/**
 * Character looks. The two heroes and the colleagues of the slice.
 * @type {Record<string, import('../gfx/characters.js').Look & {name: string, title?: string, scale: number}>}
 */
export const CAST = {
  kevin: {
    name: 'Kévin',
    title: 'Directeur de Projets',
    scale: 0.82,
    skin: '#f2c7a1',
    hair: '#5a3a22',
    hairStyle: 'quiff',
    jacket: '#27408b',
    shirt: '#f4f6fb',
    tie: '#ff8a2a',
    legs: '#2a3247',
    shoes: '#3a2418',
  },
  charline: {
    name: 'Charline',
    title: 'Business Manager',
    scale: 0.8,
    skin: '#f4cdb0',
    hair: '#2b1a12',
    hairStyle: 'long',
    jacket: '#d6336c',
    shirt: '#fff4f8',
    skirt: '#2d2240',
    legs: '#c98f78',
    shoes: '#1d1420',
    lips: '#c2185b',
    earrings: true,
  },
  mathis: {
    name: 'Mathis',
    scale: 0.8,
    skin: '#e8b48f',
    hair: '#c79a3a',
    hairStyle: 'short',
    jacket: '#3d7a5a',
    shirt: '#e9f2ec',
    legs: '#34445a',
    shoes: '#f1f1f1',
    glasses: true,
    prop: 'laptop',
  },
};
