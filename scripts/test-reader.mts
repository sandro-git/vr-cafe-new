#!/usr/bin/env bun

import { reader } from '../src/lib/keystatic-reader';

async function test() {
  console.log('Testing Keystatic Reader...\n');

  // Test reading a single game
  const game = await reader.collections.games.read('cyberpunk');
  console.log('Game "cyberpunk":', {
    name: game?.name,
    tag: game?.tag,
    tags: game?.tags,
    image: game?.image
  });

  console.log('\n---\n');

  // Test reading a tag
  const tag = await reader.collections.tags.read('escapeGame');
  console.log('Tag "escapeGame":', tag);

  console.log('\n---\n');

  // Test if tag value from game matches
  if (game?.tag) {
    console.log(`Trying to read tag "${game.tag}"...`);
    const resolvedTag = await reader.collections.tags.read(game.tag);
    console.log('Resolved tag:', resolvedTag);
  }
}

test();
