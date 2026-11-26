import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { config } from '../config.js';
import type { WordRecord } from '../../shared/types.js';

async function fetchUnsplashImageUrl(query: string): Promise<string | null> {
  if (!config.unsplashAccessKey) return null;
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${config.unsplashAccessKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      results?: Array<{ urls?: { small?: string; regular?: string } }>;
    };
    return data.results?.[0]?.urls?.small || data.results?.[0]?.urls?.regular || null;
  } catch {
    return null;
  }
}

async function fetchPexelsImageUrl(query: string): Promise<string | null> {
  if (!config.pexelsApiKey) return null;
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const response = await fetch(url, {
      headers: {
        Authorization: config.pexelsApiKey,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      photos?: Array<{ src?: { medium?: string; landscape?: string } }>;
    };
    return data.photos?.[0]?.src?.landscape || data.photos?.[0]?.src?.medium || null;
  } catch {
    return null;
  }
}

async function downloadAndCacheImage(wordId: number, remoteUrl: string): Promise<string | null> {
  try {
    const response = await fetch(remoteUrl, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 512) return null;
    fs.mkdirSync(config.imagesDir, { recursive: true });
    const fileName = `word_${wordId}.jpg`;
    const filePath = path.join(config.imagesDir, fileName);
    fs.writeFileSync(filePath, buffer);
    return `/api/images/${fileName}`;
  } catch {
    return null;
  }
}

export async function ensureWordImage(
  db: Database.Database,
  word: Pick<WordRecord, 'id' | 'image_url' | 'image_query'>,
  overrideQuery?: string
): Promise<string | null> {
  if (word.image_url) {
    if (word.image_url.startsWith('/api/images/')) {
      const fileName = path.basename(word.image_url);
      if (fs.existsSync(path.join(config.imagesDir, fileName))) {
        return word.image_url;
      }
    } else {
      return word.image_url;
    }
  }

  const localFile = `word_${word.id}.jpg`;
  if (fs.existsSync(path.join(config.imagesDir, localFile))) {
    const cachedUrl = `/api/images/${localFile}`;
    db.prepare('UPDATE words SET image_url = ? WHERE id = ?').run(cachedUrl, word.id);
    return cachedUrl;
  }

  if (!config.unsplashAccessKey && !config.pexelsApiKey) {
    return null;
  }

  const query = (overrideQuery || word.image_query || '').trim();
  if (!query) return null;

  const remoteUrl =
    (await fetchUnsplashImageUrl(query)) || (await fetchPexelsImageUrl(query));
  if (!remoteUrl) return null;

  const localCached = await downloadAndCacheImage(word.id, remoteUrl);
  const finalUrl = localCached || remoteUrl;
  db.prepare('UPDATE words SET image_url = ? WHERE id = ?').run(finalUrl, word.id);
  return finalUrl;
}
