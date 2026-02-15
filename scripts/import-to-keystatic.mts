#!/usr/bin/env bun

/**
 * Import Sanity data to Keystatic format
 * Usage: bun run scripts/import-to-keystatic.mts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

interface SanityGame {
  _id: string;
  _type: string;
  name: string;
  slug: { current: string };
  image?: any;
  youtubeLink?: string;
  description?: string;
  tag?: { _ref: string };
  tags?: Array<{ _ref: string; _key: string }>;
  editeur?: { _ref: string };
  players?: string;
  duration?: string;
  difficulty: number;
  age?: string;
}

interface SanityTag {
  _id: string;
  title: string;
}

interface SanityEditeur {
  _id: string;
  name: string;
}

async function importToKeystatic() {
  console.log('🔄 Importing data to Keystatic format...\n');

  // Read exported data
  const gamesPath = join(process.cwd(), 'scripts/exports/games.json');
  const tagsPath = join(process.cwd(), 'scripts/exports/tags.json');
  const editeursPath = join(process.cwd(), 'scripts/exports/editeurs.json');

  const games: SanityGame[] = JSON.parse(readFileSync(gamesPath, 'utf-8'));
  const tags: SanityTag[] = JSON.parse(readFileSync(tagsPath, 'utf-8'));
  const editeurs: SanityEditeur[] = JSON.parse(readFileSync(editeursPath, 'utf-8'));

  // Create reference maps
  const tagMap = new Map<string, string>();
  const editeurMap = new Map<string, string>();

  tags.forEach(tag => tagMap.set(tag._id, tag.title));
  editeurs.forEach(editeur => editeurMap.set(editeur._id, editeur.name));

  console.log(`📊 Loaded ${games.length} games, ${tags.length} tags, ${editeurs.length} publishers\n`);

  // Create directories
  const tagsDir = join(process.cwd(), 'src/content/tags');
  const editeursDir = join(process.cwd(), 'src/content/editeurs');
  const gamesDir = join(process.cwd(), 'src/content/games');

  mkdirSync(tagsDir, { recursive: true });
  mkdirSync(editeursDir, { recursive: true });
  mkdirSync(gamesDir, { recursive: true });

  // Import tags
  console.log('🏷️  Importing tags...');
  let tagsImported = 0;
  for (const tag of tags) {
    const data = { title: tag.title };
    const filename = join(tagsDir, `${tag.title}.json`);
    writeFileSync(filename, JSON.stringify(data, null, 2));
    tagsImported++;
  }
  console.log(`✅ Imported ${tagsImported} tags\n`);

  // Import editeurs
  console.log('📚 Importing publishers...');
  let editeursImported = 0;
  for (const editeur of editeurs) {
    const data = { name: editeur.name };
    const filename = join(editeursDir, `${editeur.name}.json`);
    writeFileSync(filename, JSON.stringify(data, null, 2));
    editeursImported++;
  }
  console.log(`✅ Imported ${editeursImported} publishers\n`);

  // Import games
  console.log('🎮 Importing games...');
  let gamesImported = 0;
  let gamesSkipped = 0;

  for (const game of games) {
    const slug = game.slug?.current;
    if (!slug) {
      console.log(`⚠️  No slug for game ${game._id}, skipping`);
      gamesSkipped++;
      continue;
    }

    try {
      // Transform tag reference
      const tagSlug = game.tag?._ref ? tagMap.get(game.tag._ref) : null;
      if (!tagSlug) {
        console.log(`⚠️  No tag found for game ${slug}, skipping`);
        gamesSkipped++;
        continue;
      }

      // Transform tags array
      const tagsArray = game.tags?.map(t => tagMap.get(t._ref)).filter(Boolean) || [];

      // Transform editeur reference
      const editeurSlug = game.editeur?._ref ? editeurMap.get(game.editeur._ref) : null;

      // Check if image exists
      const imagePath = `/images/games/${slug}.jpg`;
      const imageExists = existsSync(join(process.cwd(), 'public', imagePath));

      if (!imageExists) {
        console.log(`⚠️  Image not found for ${slug}, skipping`);
        gamesSkipped++;
        continue;
      }

      // Build frontmatter
      const frontmatter: any = {
        name: game.name,
        image: imagePath,
        imageAlt: game.name, // Use game name as default alt text
        tag: tagSlug,
      };

      // Only add difficulty if it has a value
      if (game.difficulty != null) {
        frontmatter.difficulty = game.difficulty;
      }

      if (game.youtubeLink) {
        frontmatter.youtubeLink = game.youtubeLink;
      }

      if (tagsArray.length > 0) {
        frontmatter.tags = tagsArray;
      }

      if (editeurSlug) {
        frontmatter.editeur = editeurSlug;
      }

      if (game.players) {
        frontmatter.players = game.players;
      }

      if (game.duration) {
        frontmatter.duration = game.duration;
      }

      if (game.age) {
        frontmatter.age = game.age;
      }

      // Build Markdoc file with YAML frontmatter
      const yamlFrontmatter = YAML.stringify(frontmatter);
      const description = game.description || '';

      const content = `---
${yamlFrontmatter.trim()}
---
${description}
`;

      // Write to file
      const filename = join(gamesDir, `${slug}.mdoc`);
      writeFileSync(filename, content);

      console.log(`✅ Imported ${slug}`);
      gamesImported++;
    } catch (error) {
      console.error(`❌ Failed to import ${slug}:`, error);
      gamesSkipped++;
    }
  }

  console.log(`\n✨ Import complete!`);
  console.log(`   Games imported: ${gamesImported}`);
  console.log(`   Games skipped: ${gamesSkipped}`);
  console.log(`   Tags imported: ${tagsImported}`);
  console.log(`   Publishers imported: ${editeursImported}`);
}

importToKeystatic();
