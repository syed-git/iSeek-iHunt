const CATEGORIES = [
  { name: 'Cars', icon: '🚗', prompts: ['a car', 'an SUV', 'a hatchback car', 'a sedan car'] },
  { name: 'Bikes & Scooters', icon: '🏍️', prompts: ['a motorcycle', 'a scooter', 'a moped', 'a bicycle'] },
  { name: 'Mobile Phones', icon: '📱', prompts: ['a mobile phone', 'a smartphone', 'an iPhone'] },
  { name: 'Passports', icon: '🛂', prompts: ['a passport', 'a passport booklet'] },
  { name: 'ID Cards & Documents', icon: '🪪', prompts: ['an identity card', 'a driving licence card', 'official documents'] },
  { name: 'Wallets & Purses', icon: '👛', prompts: ['a wallet', 'a leather wallet', 'a purse'] },
  { name: 'Bags & Backpacks', icon: '🎒', prompts: ['a backpack', 'a handbag', 'a shoulder bag', 'a messenger bag'] },
  { name: 'Luggage', icon: '🧳', prompts: ['a suitcase', 'luggage', 'a trolley bag'] },
  { name: 'Laptops & Tablets', icon: '💻', prompts: ['a laptop', 'a MacBook', 'a tablet computer', 'an iPad'] },
  { name: 'Watches', icon: '⌚', prompts: ['a wristwatch', 'a watch'] },
  { name: 'Jewelry', icon: '💍', prompts: ['a necklace', 'a ring', 'jewelry', 'a gold chain', 'a bracelet'] },
  { name: 'Keys', icon: '🔑', prompts: ['keys', 'a bunch of keys', 'a car key fob', 'a keychain'] },
  { name: 'Cameras & Electronics', icon: '📷', prompts: ['a camera', 'a DSLR camera', 'an electronic gadget'] },
  { name: 'Headphones & Earbuds', icon: '🎧', prompts: ['headphones', 'earbuds', 'AirPods'] },
  { name: 'Eyewear', icon: '🕶️', prompts: ['sunglasses', 'eyeglasses', 'spectacles'] },
  { name: 'Umbrellas', icon: '☂️', prompts: ['an umbrella'] },
  { name: 'Toys', icon: '🧸', prompts: ['a teddy bear', 'a toy', 'a stuffed animal'] },
  { name: 'Musical Instruments', icon: '🎸', prompts: ['a guitar', 'a musical instrument', 'a violin'] },
  { name: 'Drones', icon: '🛸', prompts: ['a drone', 'a quadcopter'] },
  { name: 'Clothing', icon: '🧥', prompts: ['a jacket', 'clothing', 'a shoe'] },
  { name: 'Other', icon: '📦', prompts: ['an object'] },
];

const COLORS = ['black', 'white', 'grey', 'silver', 'red', 'blue', 'navy blue', 'green', 'yellow', 'orange', 'pink', 'purple', 'brown', 'tan', 'gold', 'turquoise'];

const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

module.exports = { CATEGORIES, CATEGORY_NAMES, COLORS };
