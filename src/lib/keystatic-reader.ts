import { createReader } from '@keystatic/core/reader';
import keystaticConfig from '../../keystatic.config';

// Create reader instance
export const reader = createReader(process.cwd(), keystaticConfig);

// Helper to extract plain text from Keystatic document field
function extractTextFromDocument(doc: any): string {
  if (!doc || !Array.isArray(doc)) return '';

  let text = '';
  for (const block of doc) {
    if (block.children) {
      for (const child of block.children) {
        if (typeof child.text === 'string') {
          text += child.text;
        }
      }
    }
    text += '\n\n';
  }

  return text.trim();
}

// Type for a game with resolved relations
export interface GameWithRelations {
  slug: string;
  name: string;
  image: string;
  imageAlt: string;
  youtubeLink?: string;
  description?: string;
  tag: {
    slug: string;
    title: string;
  } | null;
  tags: Array<{
    slug: string;
    title: string;
  }>;
  editeur: {
    slug: string;
    name: string;
  } | null;
  players?: string;
  duration?: string;
  difficulty?: number;
  age?: string;
}

/**
 * Get a game by slug with all relations resolved
 */
export async function getGameWithRelations(slug: string): Promise<GameWithRelations | null> {
  const game = await reader.collections.games.read(slug);

  if (!game) {
    return null;
  }

  // Resolve tag relationship
  let tag = null;
  if (game.tag) {
    const tagData = await reader.collections.tags.read(game.tag);
    if (tagData) {
      tag = {
        slug: game.tag,
        title: tagData.title,
      };
    }
  }

  // Resolve tags array relationships
  const tags = [];
  if (game.tags && game.tags.length > 0) {
    for (const tagSlug of game.tags) {
      if (tagSlug) {
        const tagData = await reader.collections.tags.read(tagSlug);
        if (tagData) {
          tags.push({
            slug: tagSlug,
            title: tagData.title,
          });
        }
      }
    }
  }

  // Resolve editeur relationship
  let editeur = null;
  if (game.editeur) {
    const editeurData = await reader.collections.editeurs.read(game.editeur);
    if (editeurData) {
      editeur = {
        slug: game.editeur,
        name: editeurData.name,
      };
    }
  }

  // Extract description text
  let description: string | undefined;
  if (game.description) {
    const descDoc = await game.description();
    description = extractTextFromDocument(descDoc);
  }

  return {
    slug,
    name: game.name,
    image: game.image,
    imageAlt: game.imageAlt,
    youtubeLink: game.youtubeLink || undefined,
    description,
    tag,
    tags,
    editeur,
    players: game.players || undefined,
    duration: game.duration || undefined,
    difficulty: game.difficulty != null ? game.difficulty : undefined,
    age: game.age || undefined,
  };
}

/**
 * Get all games filtered by tag
 */
export async function getGamesByTag(tagTitle: string): Promise<GameWithRelations[]> {
  const allGames = await reader.collections.games.all();
  const gamesWithRelations: GameWithRelations[] = [];

  for (const { slug } of allGames) {
    const game = await getGameWithRelations(slug);
    if (game && game.tag?.title === tagTitle) {
      gamesWithRelations.push(game);
    }
  }

  return gamesWithRelations;
}

/**
 * Get all games with relations
 */
export async function getAllGamesWithRelations(): Promise<GameWithRelations[]> {
  const allGames = await reader.collections.games.all();
  const gamesWithRelations: GameWithRelations[] = [];

  for (const { slug } of allGames) {
    const game = await getGameWithRelations(slug);
    if (game) {
      gamesWithRelations.push(game);
    }
  }

  return gamesWithRelations;
}
