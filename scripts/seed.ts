import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../src/server/config.js';
import { getDb, upsertWords, type StarterWordSeed } from '../src/server/db.js';
import { recordGeminiUsage } from '../src/server/services/adminService.js';

const FREKWENCJA_LV_URL =
  'https://raw.githubusercontent.com/frekwencja/most-common-words-multilingual/main/data/lv.txt';
const TEZAURS_ANALYZE_URL = 'https://api.tezaurs.lv:8182/analyze/';
const CLARIN_REFERENCE_URL =
  'https://repository.clarin.lv/repository/xmlui/handle/20.500.12574/148';

interface CliOptions {
  expand: boolean;
  count: number;
  clarinFile: string | null;
  tatoebaFile: string | null;
  skipTezaurs: boolean;
}

interface CandidateLemma {
  frequency_rank: number;
  lemma: string;
  part_of_speech?: string;
  paradigm_hint?: string;
  tatoeba_lv?: string;
  tatoeba_ru?: string;
}

function parseArgs(argv: string[]): CliOptions {
  let expand = false;
  let count = 500;
  let clarinFile: string | null = null;
  let tatoebaFile: string | null = null;
  let skipTezaurs = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--expand') {
      expand = true;
    } else if (arg.startsWith('--count=')) {
      count = Math.max(10, Number(arg.slice('--count='.length)) || 500);
    } else if (arg === '--count' && argv[i + 1]) {
      count = Math.max(10, Number(argv[i + 1]) || 500);
      i += 1;
    } else if (arg.startsWith('--clarin-file=')) {
      clarinFile = arg.slice('--clarin-file='.length);
    } else if (arg.startsWith('--tatoeba-file=')) {
      tatoebaFile = arg.slice('--tatoeba-file='.length);
    } else if (arg === '--skip-tezaurs') {
      skipTezaurs = true;
    }
  }

  return { expand, count, clarinFile, tatoebaFile, skipTezaurs };
}

function isValidLatvianWord(token: string): boolean {
  if (token.length < 2 || token.length > 28) return false;
  return /^[a-zāčēģīķļņšūž]+$/i.test(token);
}

function loadClarinFrequencyFile(filePath: string, limit: number): CandidateLemma[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  const result: CandidateLemma[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = trimmed.split(/[\t,;]+/);
    const candidate = (cols[0] || '').trim().toLowerCase();
    if (!isValidLatvianWord(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    result.push({
      frequency_rank: result.length + 1,
      lemma: candidate,
    });
    if (result.length >= limit) break;
  }

  return result;
}

async function fetchFrekwencjaList(limit: number): Promise<CandidateLemma[]> {
  const response = await fetch(FREKWENCJA_LV_URL, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${FREKWENCJA_LV_URL}`);
  }
  const text = await response.text();
  const lines = text.split(/\r?\n/);
  const result: CandidateLemma[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const token = line.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    if (!isValidLatvianWord(token) || seen.has(token)) continue;
    seen.add(token);
    result.push({
      frequency_rank: result.length + 1,
      lemma: token,
    });
    if (result.length >= limit) break;
  }

  return result;
}

function loadTatoebaPairs(filePath: string): Map<string, { lv: string; ru: string }> {
  const map = new Map<string, { lv: string; ru: string }>();
  if (!fs.existsSync(filePath)) return map;
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const cols = line.split('\t');
    let lv = '';
    let ru = '';
    if (cols.length >= 4) {
      lv = cols[1]?.trim() ?? '';
      ru = cols[3]?.trim() ?? '';
    } else if (cols.length >= 2) {
      lv = cols[0]?.trim() ?? '';
      ru = cols[1]?.trim() ?? '';
    }
    if (!lv || !ru || lv.length > 110) continue;
    const words = lv.toLowerCase().match(/[a-zāčēģīķļņšūž]+/gi) ?? [];
    for (const w of words) {
      if (!map.has(w)) {
        map.set(w, { lv, ru });
      }
    }
  }

  return map;
}

function mapTezaursPosToRu(posTag: string): string {
  const normalized = posTag.toLowerCase();
  if (normalized.includes('lietvārds') || normalized === 'n') return 'сущ.';
  if (normalized.includes('darbības') || normalized === 'v') return 'глаг.';
  if (normalized.includes('īpašības') || normalized === 'a') return 'прил.';
  if (normalized.includes('apstākļa') || normalized === 'r') return 'нареч.';
  if (normalized.includes('vietniekvārds') || normalized === 'p') return 'мест.';
  if (normalized.includes('prievārds') || normalized === 's') return 'предл.';
  if (normalized.includes('saiklis') || normalized === 'c') return 'союз';
  if (normalized.includes('skaitļa') || normalized === 'm') return 'числ.';
  return 'слово';
}

async function validateWithTezaurs(word: string): Promise<{
  lemma: string;
  part_of_speech?: string;
  paradigm_hint?: string;
} | null> {
  try {
    const response = await fetch(`${TEZAURS_ANALYZE_URL}${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as Array<{
      Pamatforma?: string;
      Vārdšķira?: string;
      Dzimte?: string;
      Deklinācija?: string;
      Konjugācija?: string;
    }>;
    if (!Array.isArray(payload) || payload.length === 0) return null;
    const first = payload[0];
    const lemma = (first.Pamatforma || word).trim().toLowerCase();
    const hints = [first.Vārdšķira, first.Dzimte, first.Deklinācija, first.Konjugācija]
      .filter(Boolean)
      .join(', ');
    return {
      lemma: isValidLatvianWord(lemma) ? lemma : word,
      part_of_speech: first.Vārdšķira ? mapTezaursPosToRu(first.Vārdšķira) : undefined,
      paradigm_hint: hints || undefined,
    };
  } catch {
    return null;
  }
}

async function enrichBatchWithGemini(
  ai: GoogleGenAI,
  batch: CandidateLemma[]
): Promise<StarterWordSeed[]> {
  const promptLines = batch
    .map((item) => {
      const parts = [`#${item.frequency_rank} ${item.lemma}`];
      if (item.part_of_speech) parts.push(`POS: ${item.part_of_speech}`);
      if (item.paradigm_hint) parts.push(`Tēzaurs: ${item.paradigm_hint}`);
      if (item.tatoeba_lv && item.tatoeba_ru) {
        parts.push(`Tatoeba: "${item.tatoeba_lv}" -> "${item.tatoeba_ru}"`);
      }
      return parts.join(' | ');
    })
    .join('\n');

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: `Ты — опытный лингвист-преподаватель латышского языка для русскоязычных учеников.
Для каждого латышского слова ниже сформируй точную словарную карточку на русском языке:
- Сохрани точную лемму (с диакритикой ā, č, ē, ģ, ī, ķ, ļ, ņ, š, ū, ž).
- Укажи part_of_speech кратко по-русски (сущ., глаг., прил., нареч., мест., предл., союз, числ., межд.).
- Напиши краткую, но точную грамматическую заметку на русском (род и склонение для существительных; спряжение и основные формы для глаголов; падежное управление для предлогов).
- Напиши один естественный пример предложения на латышском (fallback_example_lv) и его перевод на русский (fallback_example_ru). Если дан пример Tatoeba, можешь использовать или улучшить его.
- Подбери 2–4 английских ключевых слова для поиска фото (image_query).

Список слов:
${promptLines}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                frequency_rank: { type: Type.INTEGER },
                latvian: { type: Type.STRING },
                russian: { type: Type.STRING },
                part_of_speech: { type: Type.STRING },
                grammar_note: { type: Type.STRING },
                fallback_example_lv: { type: Type.STRING },
                fallback_example_ru: { type: Type.STRING },
                image_query: { type: Type.STRING },
              },
              required: [
                'frequency_rank',
                'latvian',
                'russian',
                'part_of_speech',
                'grammar_note',
                'fallback_example_lv',
                'fallback_example_ru',
                'image_query',
              ],
            },
          },
        },
        required: ['items'],
      },
    },
  });

  recordGeminiUsage(getDb(), {
    userId: null,
    operation: 'seed_enrichment',
    model: config.geminiModel,
    usageMetadata: response.usageMetadata,
  });

  const parsed = JSON.parse(response.text || '{"items":[]}') as { items: StarterWordSeed[] };
  return Array.isArray(parsed.items) ? parsed.items : [];
}

async function seedStarter(): Promise<number> {
  const db = getDb();
  const starterPath = path.resolve(process.cwd(), 'scripts/data/starter_words.json');
  const starterWords = JSON.parse(fs.readFileSync(starterPath, 'utf-8')) as StarterWordSeed[];
  const upserted = upsertWords(db, starterWords);
  console.log(`Starter dataset upserted: ${upserted} words.`);
  return upserted;
}

async function runExpansion(options: CliOptions): Promise<void> {
  const db = getDb();
  await seedStarter();

  const existingRows = db.prepare('SELECT latvian FROM words').all() as Array<{ latvian: string }>;
  const existingSet = new Set(existingRows.map((r) => r.latvian.toLowerCase()));

  let candidates: CandidateLemma[] = [];
  if (options.clarinFile) {
    console.log(`Loading CLARIN-LV frequency list from ${options.clarinFile} (ref: ${CLARIN_REFERENCE_URL})`);
    candidates = loadClarinFrequencyFile(options.clarinFile, options.count * 2);
  } else {
    console.log(`Fetching OpenSubtitles frequency list from ${FREKWENCJA_LV_URL}...`);
    candidates = await fetchFrekwencjaList(options.count * 2);
  }

  const tatoebaMap = options.tatoebaFile ? loadTatoebaPairs(options.tatoebaFile) : new Map();

  let tezaursAvailable = !options.skipTezaurs;
  if (tezaursAvailable) {
    const probe = await validateWithTezaurs('māja');
    if (!probe) {
      tezaursAvailable = false;
      console.log('Tēzaurs.lv API unreachable; continuing with frequency list lemmas.');
    } else {
      console.log('Tēzaurs.lv API reachable; morphological lemma normalization enabled.');
    }
  }

  const filtered: CandidateLemma[] = [];
  const batchSeen = new Set<string>(existingSet);

  for (const cand of candidates) {
    if (filtered.length >= options.count) break;
    let lemma = cand.lemma;
    let pos: string | undefined;
    let paradigmHint: string | undefined;

    if (tezaursAvailable) {
      const analyzed = await validateWithTezaurs(cand.lemma);
      if (analyzed) {
        lemma = analyzed.lemma;
        pos = analyzed.part_of_speech;
        paradigmHint = analyzed.paradigm_hint;
      }
    }

    if (batchSeen.has(lemma)) continue;
    batchSeen.add(lemma);

    const tatoeba = tatoebaMap.get(lemma);
    filtered.push({
      frequency_rank: existingSet.size + filtered.length + 1,
      lemma,
      part_of_speech: pos,
      paradigm_hint: paradigmHint,
      tatoeba_lv: tatoeba?.lv,
      tatoeba_ru: tatoeba?.ru,
    });
  }

  if (filtered.length === 0) {
    console.log('No new candidate lemmas to add.');
    return;
  }

  if (!config.geminiApiKey) {
    console.log(
      `GEMINI_API_KEY is not set. Skipping AI enrichment for ${filtered.length} candidates; starter dataset remains ready.`
    );
    return;
  }

  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const batchSize = 25;
  let totalInserted = 0;

  for (let i = 0; i < filtered.length; i += batchSize) {
    const slice = filtered.slice(i, i + batchSize);
    console.log(`Enriching batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(filtered.length / batchSize)} (${slice.length} words)...`);
    const enriched = await enrichBatchWithGemini(ai, slice);
    if (enriched.length > 0) {
      totalInserted += upsertWords(db, enriched);
    }
  }

  console.log(`Expansion complete. Upserted ${totalInserted} new enriched Latvian words.`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.expand) {
    await runExpansion(options);
  } else {
    await seedStarter();
  }
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
