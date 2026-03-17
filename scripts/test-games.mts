#!/usr/bin/env bun

import { getGamesByTag } from '../src/lib/keystatic-reader';

async function test() {
  console.log('Testing getGamesByTag...\n');

  const tags = ['jeuxVR', 'escapeGame', 'freeroaming', 'escapeFreeroaming'];

  for (const tag of tags) {
    const games = await getGamesByTag(tag);
    console.log(`${tag}: ${games.length} games`);

    if (games.length > 0) {
      console.log(`  First game:`, {
        name: games[0].name,
        slug: games[0].slug,
        image: games[0].image,
        imageAlt: games[0].imageAlt,
        tag: games[0].tag?.title
      });
    }
    console.log();
  }
}

test();
