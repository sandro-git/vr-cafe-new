#!/usr/bin/env bun

import { reader, getAllGamesWithRelations } from '../src/lib/keystatic-reader';

async function debug() {
  console.log('Debugging tags...\n');

  const allGames = await getAllGamesWithRelations();
  console.log(`Total games: ${allGames.length}\n`);

  // Group by tag
  const tagCounts = new Map<string, number>();

  for (const game of allGames.slice(0, 5)) {
    console.log(`Game: ${game.name}`);
    console.log(`  Tag slug: ${game.tag?.slug}`);
    console.log(`  Tag title: ${game.tag?.title}`);
    console.log();

    const tagTitle = game.tag?.title;
    if (tagTitle) {
      tagCounts.set(tagTitle, (tagCounts.get(tagTitle) || 0) + 1);
    }
  }

  console.log('\nTag distribution (first 5 games):');
  for (const [tag, count] of tagCounts) {
    console.log(`  ${tag}: ${count}`);
  }
}

debug();
