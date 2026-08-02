import { readFile } from 'node:fs/promises';
import process from 'node:process';

const collections = ['news', 'events', 'hero', 'pages'];
let failed = false;

for (const name of collections) {
  const file = new URL(`../data/cms/${name}.json`, import.meta.url);

  try {
    const items = JSON.parse(await readFile(file, 'utf8'));

    if (!Array.isArray(items)) {
      throw new Error('root value must be an array');
    }

    const ids = new Set();
    const duplicates = new Set();

    for (const [index, item] of items.entries()) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`item ${index + 1} must be an object`);
      }

      if (typeof item.id !== 'string' || !item.id.trim()) {
        throw new Error(`item ${index + 1} has no valid id`);
      }

      if (ids.has(item.id)) duplicates.add(item.id);
      ids.add(item.id);
    }

    if (duplicates.size) {
      throw new Error(`duplicate id(s): ${[...duplicates].join(', ')}`);
    }

    console.log(`✓ ${name}.json: ${items.length} item(s)`);
  } catch (error) {
    failed = true;
    console.error(`✗ ${name}.json: ${error.message}`);
  }
}

if (failed) process.exit(1);
