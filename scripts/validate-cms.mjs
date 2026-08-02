import { readFile, readdir } from 'node:fs/promises';
import process from 'node:process';

const collections = ['events', 'hero', 'pages'];
let failed = false;

try {
  const directory = new URL('../data/cms/news/', import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  const items = await Promise.all(files.map(async (file) => JSON.parse(await readFile(new URL(file, directory), 'utf8'))));
  validateItems('news/', items);
  console.log(`✓ news/: ${items.length} item(s)`);
} catch (error) {
  failed = true;
  console.error(`✗ news/: ${error.message}`);
}

for (const name of collections) {
  const file = new URL(`../data/cms/${name}.json`, import.meta.url);

  try {
    const items = JSON.parse(await readFile(file, 'utf8'));

    if (!Array.isArray(items)) {
      throw new Error('root value must be an array');
    }

    validateItems(`${name}.json`, items);

    console.log(`✓ ${name}.json: ${items.length} item(s)`);
  } catch (error) {
    failed = true;
    console.error(`✗ ${name}.json: ${error.message}`);
  }
}

function validateItems(name, items) {
  if (!Array.isArray(items)) throw new Error(`${name}: root value must be an array`);

  const ids = new Set();
  const duplicates = new Set();
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`${name}: item ${index + 1} must be an object`);
    }
    if (typeof item.id !== 'string' || !item.id.trim()) {
      throw new Error(`${name}: item ${index + 1} has no valid id`);
    }
    if (ids.has(item.id)) duplicates.add(item.id);
    ids.add(item.id);
  }
  if (duplicates.size) throw new Error(`${name}: duplicate id(s): ${[...duplicates].join(', ')}`);
}

if (failed) process.exit(1);
