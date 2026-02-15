#!/usr/bin/env bun

/**
 * Download all game images from Sanity CDN to local public/images/games/ directory
 * Usage: bun run scripts/download-sanity-images.mts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import imageUrlBuilder from '@sanity/image-url';
import { createClient } from '@sanity/client';

const projectId = '0oshw5tf';
const dataset = 'production';

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2025-01-28',
  useCdn: true,
});

const builder = imageUrlBuilder(client);

// Helper to build image URL
function urlFor(source: any) {
  return builder.image(source);
}

async function downloadImages() {
  console.log('🔄 Downloading images from Sanity CDN...\n');

  // Create directory
  const imagesDir = join(process.cwd(), 'public/images/games');
  mkdirSync(imagesDir, { recursive: true });

  // Read exported games
  const gamesPath = join(process.cwd(), 'scripts/exports/games.json');
  const games = JSON.parse(readFileSync(gamesPath, 'utf-8'));

  let downloaded = 0;
  let skipped = 0;

  for (const game of games) {
    if (!game.image) {
      console.log(`⚠️  No image for ${game.slug?.current || game._id}`);
      skipped++;
      continue;
    }

    const slug = game.slug?.current;
    if (!slug) {
      console.log(`⚠️  No slug for game ${game._id}`);
      skipped++;
      continue;
    }

    try {
      // Build image URL at 1200px width
      const imageUrl = urlFor(game.image).width(1200).format('jpg').url();

      console.log(`⬇️  Downloading ${slug}.jpg...`);

      // Download image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Save to disk
      const filename = join(imagesDir, `${slug}.jpg`);
      writeFileSync(filename, buffer);

      console.log(`✅ Saved ${slug}.jpg (${(buffer.length / 1024).toFixed(1)} KB)\n`);
      downloaded++;
    } catch (error) {
      console.error(`❌ Failed to download ${slug}:`, error);
      skipped++;
    }
  }

  console.log(`\n✨ Download complete!`);
  console.log(`   Downloaded: ${downloaded}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total: ${games.length}`);
}

downloadImages();
