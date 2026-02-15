#!/usr/bin/env bun

/**
 * Export all data from Sanity CMS to JSON files
 * Usage: SANITY_READ_TOKEN=xxx bun run scripts/export-sanity-data.mts
 */

import { createClient } from '@sanity/client';
import { writeFileSync } from 'fs';
import { join } from 'path';

const projectId = '0oshw5tf';
const dataset = 'production';
const apiVersion = '2025-01-28';

// Optionally use a read token for private datasets
const token = process.env.SANITY_READ_TOKEN;

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false, // We want fresh data
  token,
});

async function exportData() {
  console.log('🔄 Exporting data from Sanity...\n');

  try {
    // Export games
    console.log('📦 Fetching games...');
    const games = await client.fetch('*[_type == "games"]');
    writeFileSync(
      join(process.cwd(), 'scripts/exports/games.json'),
      JSON.stringify(games, null, 2)
    );
    console.log(`✅ Exported ${games.length} games\n`);

    // Export tags
    console.log('🏷️  Fetching tags...');
    const tags = await client.fetch('*[_type == "tag"]');
    writeFileSync(
      join(process.cwd(), 'scripts/exports/tags.json'),
      JSON.stringify(tags, null, 2)
    );
    console.log(`✅ Exported ${tags.length} tags\n`);

    // Export editeurs
    console.log('📚 Fetching publishers...');
    const editeurs = await client.fetch('*[_type == "editeur"]');
    writeFileSync(
      join(process.cwd(), 'scripts/exports/editeurs.json'),
      JSON.stringify(editeurs, null, 2)
    );
    console.log(`✅ Exported ${editeurs.length} publishers\n`);

    console.log('✨ Export complete! Files saved in scripts/exports/');
  } catch (error) {
    console.error('❌ Export failed:', error);
    process.exit(1);
  }
}

exportData();
