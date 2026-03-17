#!/usr/bin/env bun

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

const gamesDir = join(process.cwd(), 'src/content/games');

const files = readdirSync(gamesDir).filter(f => f.endsWith('.yaml'));

console.log(`Converting ${files.length} YAML files back to MDOC...\n`);

for (const file of files) {
  const filePath = join(gamesDir, file);
  const content = readFileSync(filePath, 'utf-8');

  // Parse YAML
  const data = YAML.parse(content);

  // Extract description
  const description = data.description || '';
  delete data.description;

  // Build frontmatter
  const frontmatter = YAML.stringify(data);

  // Build MDOC content
  const mdocContent = `---
${frontmatter.trim()}
---
${description}
`;

  // Write MDOC file
  const mdocPath = filePath.replace('.yaml', '.mdoc');
  writeFileSync(mdocPath, mdocContent);

  console.log(`✅ ${file} -> ${file.replace('.yaml', '.mdoc')}`);
}

console.log(`\n✨ Done! Run: rm src/content/games/*.yaml`);
