import { describe, expect, it } from '@jest/globals';
import { slugify, uniqueSlug } from '../../../../src/core/utils/slug.js';

describe('slugify', () => {
  it.each([
    ['Mama Put Kitchen', 'mama-put-kitchen'],
    ["Tolu's Pot", 'tolus-pot'],
    ['Iya Funke  Bukka!!', 'iya-funke-bukka'],
    ['Àmàlà & Ewédú Spot', 'amala-ewedu-spot'],
    ['  --Suya Spot--  ', 'suya-spot'],
    ['', ''],
  ])('%p → %p', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe('uniqueSlug', () => {
  const takenFrom = (taken) => async (slug) => taken.includes(slug);

  it('uses the plain slug when free', async () => {
    expect(await uniqueSlug('Suya Spot', takenFrom([]))).toBe('suya-spot');
  });

  it('adds the next free number', async () => {
    expect(await uniqueSlug('Suya Spot', takenFrom(['suya-spot']))).toBe('suya-spot-2');
    expect(await uniqueSlug('Suya Spot', takenFrom(['suya-spot', 'suya-spot-2']))).toBe('suya-spot-3');
  });

  it('falls back when the name has no letters or digits', async () => {
    expect(await uniqueSlug('!!!', takenFrom([]))).toBe('store');
  });

  it('keeps long slugs within maxLength, suffix included', async () => {
    const long = 'a'.repeat(100);
    expect(await uniqueSlug(long, takenFrom([]), { maxLength: 20 })).toBe('a'.repeat(20));
    expect(await uniqueSlug(long, takenFrom(['a'.repeat(20)]), { maxLength: 20 })).toBe(`${'a'.repeat(18)}-2`);
  });
});
