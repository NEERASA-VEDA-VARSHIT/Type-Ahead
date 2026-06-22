import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_TERMS = [
  'iphone', 'samsung', 'macbook', 'airpods', 'ipad', 'apple watch',
  'laptop', 'shoes', 'dress', 'bag', 'headphones', 'camera',
  'tablet', 'monitor', 'keyboard', 'mouse', 'chair', 'desk',
  'speaker', 'tv', 'refrigerator', 'washing machine', 'ac',
  'fan', 'heater', 'coffee maker', 'blender', 'microwave',
  'printer', 'router', 'hard drive', 'ssd', 'ram', 'graphics card',
  'bike', 'car accessories', 'book', 'toy', 'game', 'console',
  'ps5', 'xbox', 'nintendo switch', 'smart watch', 'fitness tracker',
  't shirt', 'jeans', 'jacket', 'sneakers', 'sunglasses',
  'backpack', 'wallet', 'watch', 'perfume', 'makeup kit',
];

const MODIFIERS = [
  'buy', 'price', 'review', 'best', 'cheap', 'expensive',
  'near me', 'online', 'sale', 'discount', '2024', '2025',
  'pro', 'max', 'ultra', 'mini', 'lite', 'plus',
  'charger', 'case', 'cover', 'screen protector', 'cable',
  'wireless', 'bluetooth', 'usb', 'type c', 'hdmi',
  'black', 'white', 'red', 'blue', 'green', 'pink',
  'leather', 'metal', 'plastic', 'wooden', 'glass',
  'small', 'medium', 'large', 'xl', 'xxl',
  'men', 'women', 'kids', 'unisex', 'baby',
  'summer', 'winter', 'spring', 'fall', 'rainy',
  'office', 'school', 'college', 'home', 'travel',
  'running', 'walking', 'hiking', 'cycling', 'swimming',
  'gaming', 'work', 'study', 'party', 'casual',
  '10', '20', '30', '50', '100', '500',
  '1kg', '2kg', '5kg', '10kg', '20kg',
  'pack of 2', 'pack of 3', 'pack of 5', 'pack of 10',
  'combo', 'set', 'kit', 'bundle', 'pack',
];

const BRANDS = [
  'nike', 'adidas', 'puma', 'reebok', 'under armour',
  'apple', 'samsung', 'sony', 'lg', 'panasonic',
  'bose', 'jbl', 'boat', 'mivi', 'noise',
  'dell', 'hp', 'lenovo', 'asus', 'acer',
  'canon', 'nikon', 'fujifilm', 'gopro', 'polaroid',
  'toyota', 'honda', 'bmw', 'mercedes', 'audi',
  'zara', 'hm', 'gucci', 'prada', 'louis vuitton',
  'levis', 'wrangler', 'spykar', 'mufti', 'pepe jeans',
  'fastrack', 'titan', 'casio', 'fossil', 'timex',
  'maybelline', 'lakme', 'mac', 'nykaa', 'loreal',
];

function weightedRandom(min: number, max: number, power: number): number {
  const r = Math.pow(Math.random(), power);
  return Math.floor(min + r * (max - min));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateQueries(count: number): [string, number][] {
  const queries: [string, number][] = [];
  const seen = new Set<string>();

  for (let i = 0; i < count; i++) {
    let query: string;

    const r = Math.random();
    if (r < 0.15) {
      query = pick(BASE_TERMS);
    } else if (r < 0.40) {
      query = `${pick(BASE_TERMS)} ${pick(MODIFIERS)}`;
    } else if (r < 0.65) {
      query = `${pick(BRANDS)} ${pick(BASE_TERMS)}`;
    } else if (r < 0.85) {
      query = `${pick(BASE_TERMS)} ${pick(MODIFIERS)} ${pick(MODIFIERS)}`;
    } else {
      query = `${pick(BRANDS)} ${pick(BASE_TERMS)} ${pick(MODIFIERS)}`;
    }

    if (seen.has(query)) {
      i--;
      continue;
    }
    seen.add(query);

    const count = weightedRandom(1, 200000, 2.5);
    queries.push([query, count]);
  }

  queries.sort((a, b) => b[1] - a[1]);
  return queries;
}

function main() {
  const totalQueries = 100000;
  console.log(`Generating ${totalQueries} search queries...`);

  const queries = generateQueries(totalQueries);
  const csvPath = join(__dirname, 'queries.csv');

  const header = 'query,count\n';
  const lines = queries.map(([q, c]) => `"${q}",${c}`).join('\n');

  writeFileSync(csvPath, header + lines, 'utf-8');
  console.log(`CSV written to ${csvPath}`);
  console.log(`Total queries: ${queries.length}`);
  console.log(`Top 5: ${queries.slice(0, 5).map(([q, c]) => `${q} (${c})`).join(', ')}`);
}

main();
