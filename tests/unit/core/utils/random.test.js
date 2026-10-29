import { describe, expect, it } from '@jest/globals';
import { createSeededFaker, weighted } from '../../../../src/core/utils/random.js';

const sample = (faker) => [faker.person.fullName(), faker.string.alphanumeric(6), faker.number.int(1000)];

describe('seeded faker', () => {
  it('gives the same values for the same seed', () => {
    expect(sample(createSeededFaker())).toEqual(sample(createSeededFaker()));
  });

  it('gives different values for another seed', () => {
    expect(sample(createSeededFaker(1))).not.toEqual(sample(createSeededFaker(2)));
  });

  it('uses Nigerian data', () => {
    const faker = createSeededFaker();
    expect(faker.rawDefinitions.metadata.code).toBe('en_NG');
  });
});

describe('weighted', () => {
  it('follows the weights and is repeatable', () => {
    const roll = () => {
      const faker = createSeededFaker();
      return Array.from({ length: 2000 }, () =>
        weighted(faker, [
          ['delivered', 20],
          ['cancelled', 1.2],
          ['rejected', 1],
        ]),
      );
    };
    const picks = roll();
    expect(roll()).toEqual(picks);
    const delivered = picks.filter((p) => p === 'delivered').length / picks.length;
    expect(delivered).toBeGreaterThan(0.85);
    expect(delivered).toBeLessThan(0.95);
    expect(picks).toContain('rejected');
  });
});
