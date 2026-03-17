#!/usr/bin/env bun

import { reader } from '../src/lib/keystatic-reader';

async function listTags() {
  console.log('Listing all tags...\n');

  const allTags = await reader.collections.tags.all();
  console.log(`Total tags: ${allTags.length}\n`);

  for (const { slug, entry } of allTags.slice(0, 10)) {
    console.log(`Slug: "${slug}"`, entry);
  }
}

listTags();
