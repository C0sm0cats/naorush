import { describe, expect, it } from 'vitest';
import { POSTER_LIST } from '../src/gfx/posters.js';

const IDS = [
  'inetum-lcp7',
  'learning-academy',
  'chronotime',
  'global-service-center',
  'sap-concur',
  'mypeopledoc',
  'swile',
  'bon-commande',
  'ordre-mission',
  'success-factors',
  'gcomp',
  'power-up',
  'power-up-tour',
  'lets-connect',
  'gen-ai',
  'charity-day',
  'summer-party',
  'cooptation',
  'espace-vip',
  'your-digital-hub',
  'my-way',
  'spark',
  'gofluent',
  'primo',
  'copil',
  'covoiturage',
  'note-de-frais',
  'inetum-et-moi',
  'adopt-tools',
  'gen-ai-hub',
  'annuaire',
  'celine-dion',
];

describe('POSTER_LIST', () => {
  it('lists the 32 poster ids exactly once', () => {
    const ids = POSTER_LIST.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...IDS].sort());
  });

  it('gives every poster a title and a valid shape', () => {
    for (const p of POSTER_LIST) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(['portrait', 'landscape', 'banner']).toContain(p.shape);
    }
  });

  it('uses the banner format for the two banners', () => {
    const banners = POSTER_LIST.filter((p) => p.shape === 'banner').map((p) => p.id);
    expect(banners.sort()).toEqual(['espace-vip', 'power-up-tour']);
  });
});
