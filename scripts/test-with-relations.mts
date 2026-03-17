#!/usr/bin/env bun

import { getGameWithRelations } from '../src/lib/keystatic-reader';

async function test() {
  const game = await getGameWithRelations('cyberpunk');

  console.log('Game:', game?.name);
  console.log('\nDescription type:', typeof game?.description);
  console.log('\nDescription (first 200 chars):', game?.description?.substring(0, 200));
}

test();
