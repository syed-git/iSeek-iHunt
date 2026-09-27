const { COLORS } = require('../categories');

const CATEGORY_SYNONYMS = [
  ['Keys', ['car key', 'car keys', 'key fob', 'keychain', 'key chain', 'keyring', 'key ring', 'house key', 'keys', 'key']],
  ['Headphones & Earbuds', ['airpods', 'earbuds', 'earphones', 'headphones', 'headset', 'earpods']],
  ['Mobile Phones', ['iphone', 'smartphone', 'mobile phone', 'mobile', 'cell phone', 'cellphone', 'phone', 'samsung galaxy', 'pixel', 'oneplus']],
  ['Passports', ['passport']],
  ['ID Cards & Documents', ['id card', 'identity card', 'aadhaar', 'aadhar', 'pan card', 'driving licence', 'driving license', 'license', 'licence', 'documents', 'document', 'certificate']],
  ['Wallets & Purses', ['wallet', 'purse', 'billfold', 'card holder']],
  ['Luggage', ['suitcase', 'luggage', 'trolley bag', 'trolley', 'baggage']],
  ['Bags & Backpacks', ['backpack', 'school bag', 'handbag', 'hand bag', 'messenger bag', 'shoulder bag', 'tote', 'briefcase', 'rucksack', 'bag']],
  ['Laptops & Tablets', ['macbook', 'laptop', 'notebook computer', 'ipad', 'tablet', 'chromebook']],
  ['Watches', ['wristwatch', 'smartwatch', 'apple watch', 'g-shock', 'watch']],
  ['Jewelry', ['necklace', 'chain', 'ring', 'bracelet', 'earring', 'earrings', 'bangle', 'pendant', 'jewelry', 'jewellery']],
  ['Cameras & Electronics', ['dslr', 'camera', 'nikon', 'canon', 'gopro', 'power bank', 'charger']],
  ['Eyewear', ['sunglasses', 'spectacles', 'eyeglasses', 'glasses', 'shades', 'aviators']],
  ['Umbrellas', ['umbrella']],
  ['Toys', ['teddy', 'toy', 'doll', 'stuffed animal', 'plush']],
  ['Musical Instruments', ['guitar', 'violin', 'ukulele', 'keyboard instrument', 'flute']],
  ['Drones', ['drone', 'quadcopter', 'dji']],
  ['Bikes & Scooters', ['motorcycle', 'motorbike', 'bike', 'scooter', 'moped', 'vespa', 'bicycle', 'cycle', 'harley', 'royal enfield', 'activa']],
  ['Cars', ['car', 'suv', 'sedan', 'hatchback', 'jeep', 'vehicle', 'honda civic', 'fiat', 'chevrolet', 'toyota', 'hyundai', 'maruti']],
  ['Clothing', ['jacket', 'coat', 'shoe', 'shoes', 'shirt', 'scarf', 'cap', 'hat']],
];

const STOPWORDS = new Set('a an the my i me we our of with and or in on at to for from is was it its that this lost found have has had near by as be were color colour one some very small big large new old please help'.split(' '));

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectCategories(text) {
  let t = ` ${String(text || '').toLowerCase()} `;
  const found = [];
  for (const [cat, words] of CATEGORY_SYNONYMS) {
    for (const w of words) {
      const re = new RegExp(`\\b${escapeRe(w)}s?\\b`);
      if (re.test(t)) {
        if (!found.includes(cat)) found.push(cat);
        t = t.replace(new RegExp(`\\b${escapeRe(w)}s?\\b`, 'g'), ' ');
      }
    }
  }
  return found;
}

function detectColors(text) {
  const t = String(text || '').toLowerCase();
  const extra = { teal: 'turquoise', cyan: 'turquoise', navy: 'navy blue', gray: 'grey', golden: 'gold', maroon: 'red', burgundy: 'red', beige: 'tan', cream: 'white' };
  const out = new Set();
  for (const c of COLORS) if (new RegExp(`\\b${escapeRe(c)}\\b`).test(t)) out.add(c);
  for (const [k, v] of Object.entries(extra)) if (new RegExp(`\\b${k}\\b`).test(t)) out.add(v);
  if (out.has('navy blue')) out.delete('blue');
  return [...out];
}

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

module.exports = { detectCategories, detectColors, tokens };
