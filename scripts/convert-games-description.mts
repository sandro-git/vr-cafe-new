#!/usr/bin/env bun

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

const gamesDir = join(process.cwd(), 'src/content/games');

const files = readdirSync(gamesDir).filter(f => f.endsWith('.mdoc'));

console.log(`Converting ${files.length} game files...\n`);

let converted = 0;

for (const file of files) {
  const filePath = join(gamesDir, file);
  const content = readFileSync(filePath, 'utf-8');

  // Split frontmatter and content
  const parts = content.split('---\n');

  if (parts.length < 3) {
    console.log(`⚠️  Skipping ${file} - invalid format`);
    continue;
  }

  // Parse frontmatter
  const frontmatter = YAML.parse(parts[1]);

  // Get description from content (after second ---)
  const description = parts.slice(2).join('---\n').trim();

  // Add description to frontmatter
  frontmatter.description = description;

  // Write as YAML file
  const yamlContent = YAML.stringify(frontmatter);
  const newFilePath = filePath.replace('.mdoc', '.yaml');

  writeFileSync(newFilePath, yamlContent);

  console.log(`✅ Converted ${file} -> ${file.replace('.mdoc', '.yaml')}`);
  converted++;
}

console.log(`\n✨ Converted ${converted} files!`);
console.log(`Now run: rm src/content/games/*.mdoc`);
