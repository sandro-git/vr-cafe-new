#!/usr/bin/env bun

import { reader } from '../src/lib/keystatic-reader';

async function test() {
  console.log('Testing games collection...\n');

  const allGames = await reader.collections.games.all();
  console.log(`Total games: ${allGames.length}\n`);

  if (allGames.length > 0) {
    const first = allGames[0];
    console.log(`First game slug: "${first.slug}"`);
    console.log(`First game entry:`, first.entry);
  }
}

test();
