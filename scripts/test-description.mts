#!/usr/bin/env bun

import { reader } from '../src/lib/keystatic-reader';

async function test() {
  const game = await reader.collections.games.read('cyberpunk');

  console.log('Game:', game?.name);
  console.log('\nDescription type:', typeof game?.description);

  if (game?.description) {
    const desc = await game.description();
    console.log('\nDescription result type:', typeof desc);
    console.log('Description result:', desc);
    console.log('\nDescription keys:', Object.keys(desc || {}));
  }
}

test();
