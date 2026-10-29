import { Faker, base, en, en_NG } from '@faker-js/faker';

// Fixed seed for the demo world (handoff section 8): same data on every `npm run seed`
export const SEED = 2026;

/**
 * A Faker instance with Nigerian names and places, seeded so its output is repeatable.
 * Use it for every random choice in the seeder (never Math.random). Times stay relative to
 * `now`, which the seeder passes in.
 */
export const createSeededFaker = (seed = SEED) => {
  const faker = new Faker({ locale: [en_NG, en, base] });
  faker.seed(seed);
  return faker;
};

/** Picks an item with probability proportional to its weight: weighted(faker, [['a', 3], ['b', 1]]). */
export const weighted = (faker, entries) => {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = faker.number.float({ min: 0, max: total });
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1][0];
};
