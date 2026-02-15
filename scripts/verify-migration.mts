#!/usr/bin/env bun

/**
 * Verify that the migration from Sanity to Keystatic was successful
 * Usage: bun run scripts/verify-migration.mts
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

async function verifyMigration() {
  console.log('🔍 Verifying migration from Sanity to Keystatic...\n');

  // Read exported Sanity data
  const gamesPath = join(process.cwd(), 'scripts/exports/games.json');
  const tagsPath = join(process.cwd(), 'scripts/exports/tags.json');
  const editeursPath = join(process.cwd(), 'scripts/exports/editeurs.json');

  const sanityGames = JSON.parse(readFileSync(gamesPath, 'utf-8'));
  const sanityTags = JSON.parse(readFileSync(tagsPath, 'utf-8'));
  const sanityEditeurs = JSON.parse(readFileSync(editeursPath, 'utf-8'));

  console.log(`📊 Sanity data counts:`);
  console.log(`   Games: ${sanityGames.length}`);
  console.log(`   Tags: ${sanityTags.length}`);
  console.log(`   Publishers: ${sanityEditeurs.length}\n`);

  // Read Keystatic data
  const keystaticGamesDir = join(process.cwd(), 'src/content/games');
  const keystaticTagsDir = join(process.cwd(), 'src/content/tags');
  const keystaticEditeursDir = join(process.cwd(), 'src/content/editeurs');

  const keystaticGames = readdirSync(keystaticGamesDir).filter(f => f.endsWith('.mdoc'));
  const keystaticTags = readdirSync(keystaticTagsDir).filter(f => f.endsWith('.json'));
  const keystaticEditeurs = readdirSync(keystaticEditeursDir).filter(f => f.endsWith('.json'));

  console.log(`📊 Keystatic data counts:`);
  console.log(`   Games: ${keystaticGames.length}`);
  console.log(`   Tags: ${keystaticTags.length}`);
  console.log(`   Publishers: ${keystaticEditeurs.length}\n`);

  // Check if counts match
  let success = true;

  if (sanityGames.length !== keystaticGames.length) {
    console.error(`❌ Game count mismatch! Sanity: ${sanityGames.length}, Keystatic: ${keystaticGames.length}`);
    success = false;
  } else {
    console.log(`✅ Game count matches: ${sanityGames.length}`);
  }

  if (sanityTags.length !== keystaticTags.length) {
    console.error(`❌ Tag count mismatch! Sanity: ${sanityTags.length}, Keystatic: ${keystaticTags.length}`);
    success = false;
  } else {
    console.log(`✅ Tag count matches: ${sanityTags.length}`);
  }

  if (sanityEditeurs.length !== keystaticEditeurs.length) {
    console.error(`❌ Publisher count mismatch! Sanity: ${sanityEditeurs.length}, Keystatic: ${keystaticEditeurs.length}`);
    success = false;
  } else {
    console.log(`✅ Publisher count matches: ${sanityEditeurs.length}`);
  }

  // Check if all Sanity game slugs exist in Keystatic
  console.log(`\n🔍 Checking if all Sanity games exist in Keystatic...`);
  const keystaticGameSlugs = new Set(keystaticGames.map(f => f.replace('.mdoc', '')));
  const missingSlugs: string[] = [];

  for (const game of sanityGames) {
    const slug = game.slug?.current;
    if (!slug) continue;

    if (!keystaticGameSlugs.has(slug)) {
      missingSlugs.push(slug);
    }
  }

  if (missingSlugs.length > 0) {
    console.error(`❌ Missing ${missingSlugs.length} games in Keystatic:`);
    missingSlugs.forEach(slug => console.error(`   - ${slug}`));
    success = false;
  } else {
    console.log(`✅ All Sanity games found in Keystatic`);
  }

  // Summary
  console.log(`\n${success ? '✨ Migration verification successful!' : '❌ Migration verification failed!'}`);
  process.exit(success ? 0 : 1);
}

verifyMigration();
