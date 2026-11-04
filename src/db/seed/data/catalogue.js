// Categories, dishes and option groups (handoff 8.3; same rows as the frontend mock catalogue-data.js)

export const CATEGORIES = [
  { id: 'cat-rice', name: 'Rice dishes', slug: 'rice', icon: '🍚', sortOrder: 0 },
  { id: 'cat-swallow', name: 'Swallow and soups', slug: 'swallow', icon: '🥣', sortOrder: 1 },
  { id: 'cat-grills', name: 'Grills and suya', slug: 'grills', icon: '🍢', sortOrder: 2 },
  { id: 'cat-small-chops', name: 'Small chops', slug: 'small-chops', icon: '🥟', sortOrder: 3 },
  { id: 'cat-pepper-soup', name: 'Pepper soup', slug: 'pepper-soup', icon: '🍲', sortOrder: 4 },
  { id: 'cat-beans', name: 'Beans and plantain', slug: 'beans', icon: '🫘', sortOrder: 5 },
  { id: 'cat-breakfast', name: 'Breakfast', slug: 'breakfast', icon: '🍳', sortOrder: 6 },
  { id: 'cat-pastries', name: 'Pastries and snacks', slug: 'pastries', icon: '🥐', sortOrder: 7 },
  { id: 'cat-drinks', name: 'Drinks', slug: 'drinks', icon: '🥤', sortOrder: 8 },
  { id: 'cat-seafood', name: 'Seafood', slug: 'seafood', icon: '🦐', sortOrder: 9 },
  { id: 'cat-continental', name: 'Continental', slug: 'continental', icon: '🍝', sortOrder: 10 },
  { id: 'cat-desserts', name: 'Desserts', slug: 'desserts', icon: '🍰', sortOrder: 11 },
];

/** [name, categoryId, minNaira, maxNaira, description]; photos come from seed-images.json by name */
export const DISHES = [
  ['Party jollof rice', 'cat-rice', 2500, 4500, 'Smoky party jollof cooked over firewood, served with fried plantain.'],
  [
    'Fried rice and chicken',
    'cat-rice',
    3000,
    5500,
    'Nigerian fried rice with mixed vegetables, liver and a quarter chicken.',
  ],
  [
    'Ofada rice and ayamase',
    'cat-rice',
    3500,
    6000,
    'Local ofada rice with green pepper ayamase stew, assorted meat and egg.',
  ],
  ['Coconut rice', 'cat-rice', 3000, 5000, 'Fragrant coconut rice with sautéed prawns.'],
  ['Amala and ewedu', 'cat-swallow', 2000, 4000, 'Soft amala with ewedu, gbegiri and buka stew.'],
  ['Pounded yam and egusi', 'cat-swallow', 3000, 5500, 'Fluffy pounded yam with rich egusi soup and goat meat.'],
  ['Eba and okra soup', 'cat-swallow', 2000, 4000, 'Garri eba with draw okra soup, fish and ponmo.'],
  ['Semo and afang soup', 'cat-swallow', 3000, 5000, 'Semovita with afang soup loaded with periwinkle.'],
  ['Fufu and oha soup', 'cat-swallow', 3000, 5000, 'Cassava fufu with oha soup and stockfish.'],
  ['Beef suya', 'cat-grills', 2000, 5000, 'Spicy yaji beef suya with onions, tomatoes and cabbage.'],
  ['Chicken suya', 'cat-grills', 2500, 5000, 'Grilled chicken suya with extra yaji on the side.'],
  ['Asun', 'cat-grills', 3500, 6000, 'Peppered smoked goat meat, Lagos party style.'],
  ['Grilled catfish', 'cat-grills', 5000, 9000, 'Whole point-and-kill catfish grilled with pepper sauce.'],
  ['Small chops platter', 'cat-small-chops', 3000, 7000, 'Puff-puff, samosa, spring rolls and peppered gizzard.'],
  ['Puff-puff', 'cat-small-chops', 800, 1500, 'Soft, sweet puff-puff dusted with sugar.'],
  ['Peppered gizzard', 'cat-small-chops', 2000, 3500, 'Fried gizzard tossed in pepper sauce.'],
  ['Goat meat pepper soup', 'cat-pepper-soup', 3000, 5000, 'Hot goat meat pepper soup with uziza and scent leaf.'],
  ['Catfish pepper soup', 'cat-pepper-soup', 4000, 7000, 'Fresh catfish pepper soup, perfect for rainy evenings.'],
  ['Ewa agoyin and bread', 'cat-beans', 1500, 3000, 'Mashed beans with dark agoyin sauce and agege bread.'],
  ['Beans and dodo', 'cat-beans', 1500, 3000, 'Honey beans porridge with fried sweet plantain.'],
  ['Moi moi', 'cat-beans', 800, 1500, 'Steamed bean pudding with egg and fish.'],
  ['Akara and pap', 'cat-breakfast', 1000, 2000, 'Crispy akara with smooth ogi.'],
  ['Yam and egg sauce', 'cat-breakfast', 1800, 3000, 'Boiled yam with tomato egg sauce.'],
  ['Meat pie', 'cat-pastries', 700, 1500, 'Buttery meat pie with minced beef and potatoes.'],
  ['Chin chin (500 g)', 'cat-pastries', 1500, 2500, 'Crunchy home-made chin chin.'],
  ['Zobo (1 L)', 'cat-drinks', 800, 1500, 'Chilled zobo with ginger and pineapple.'],
  ['Kunu (1 L)', 'cat-drinks', 800, 1500, 'Fresh tiger nut kunu.'],
  ['Chapman', 'cat-drinks', 1500, 2500, 'Classic Nigerian Chapman with cucumber and orange.'],
  ['Seafood okra', 'cat-seafood', 6000, 12000, 'Okra soup with prawns, crab and calamari.'],
  ['Peppered snail', 'cat-seafood', 4000, 8000, 'Giant snails in spicy pepper sauce.'],
  ['Spaghetti jollof', 'cat-continental', 2000, 3500, 'Jollof-style spaghetti with sausage.'],
  ['Chicken shawarma', 'cat-continental', 2500, 4500, 'Chicken shawarma with double sausage.'],
  ['Chicken and chips', 'cat-continental', 3000, 5000, 'Fried chicken with crispy chips and coleslaw.'],
  ['Parfait', 'cat-desserts', 2000, 3500, 'Yoghurt parfait with granola and fruit.'],
  ['Red velvet cake slice', 'cat-desserts', 1500, 3000, 'Moist red velvet with cream cheese icing.'],
];

/** Option groups added by category (prices in naira) */
export const OPTION_GROUPS = {
  protein: {
    name: 'Extra protein',
    required: false,
    max: 3,
    options: [
      ['Chicken', 1000],
      ['Beef', 700],
      ['Fried fish', 1200],
      ['Boiled egg', 300],
      ['Goat meat', 1500],
    ],
  },
  size: {
    name: 'Portion size',
    required: true,
    max: 1,
    options: [
      ['Regular', 0],
      ['Large', 1000],
      ['Family pack', 4000],
    ],
  },
  sides: {
    name: 'Sides',
    required: false,
    max: 2,
    options: [
      ['Fried plantain (dodo)', 500],
      ['Coleslaw', 400],
      ['Moi moi', 800],
    ],
  },
};

export const GROUPS_BY_CATEGORY = {
  protein: ['cat-rice', 'cat-swallow', 'cat-continental'],
  size: ['cat-rice', 'cat-grills', 'cat-small-chops', 'cat-pepper-soup'],
  // Added to about half of these
  sides: ['cat-rice', 'cat-beans', 'cat-grills'],
};

export const PORTIONS = ['1 plate', '1 pack', 'Serves 1', 'Serves 2', '1 bowl'];

export const STAFF_ROLES = ['manager', 'kitchen'];
