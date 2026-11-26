import { GoogleGenAI, Type } from '@google/genai';
import type Database from 'better-sqlite3';
import { config } from '../config.js';
import { getUserDashboardStats } from '../db.js';
import { recordGeminiUsage } from './adminService.js';
import { ensureWordImage } from './imageService.js';
import type {
  AnnotatedSentence,
  ContextTheme,
  DailySessionResponse,
  DistractorExplanation,
  SentencePuzzle,
  SessionAiPayload,
  SessionCheckboxState,
  SessionHistoryItem,
  SessionWordCard,
  TodaySessionEnvelope,
  TokenAnnotation,
  UserProfile,
  WordRecord,
  WordStatus,
} from '../../shared/types.js';

interface DueWordRecord extends WordRecord {
  status: WordStatus;
  ease_factor: number;
  times_seen: number;
  times_reused_in_ai: number;
  last_reviewed_at: string | null;
}

interface DailySessionRow {
  id: number;
  user_id: number;
  session_date: string;
  context_theme: ContextTheme;
  word_ids_json: string;
  ai_payload_json: string;
  checkbox_state_json: string;
  is_completed: number;
  created_at: string;
}

const THEME_PROMPT_DETAILS: Record<ContextTheme, string> = {
  riga_everyday:
    'Повседневная жизнь в Риге: покупки в Rimi и Maxima, уютные кофейни Старой Риги и Тихого центра, транспорт Rīgas satiksme (трамвай, автобус, код-билет), погода у Даугавы, бытовые дела и прогулки.',
  work_smalltalk:
    'Работа и офисное общение в Латвии: коллеги, рабочие встречи, электронная почта, обсуждение проектов, расписание и неформальные разговоры за кофе.',
  nature_outdoors:
    'Природа Латвии и активный отдых: Юрмала и Балтийское море, сосновые леса, тропы Сигулды, парки, погода, прогулки и поездки на выходных.',
  general:
    'Универсальный живой современный латышский язык: общение с друзьями, семья, дом, планы на неделю и повседневные ситуации.',
};

const THEME_TITLES_RU: Record<ContextTheme, string> = {
  riga_everyday: 'Урок дня: Повседневная Рига',
  work_smalltalk: 'Урок дня: Работа и общение',
  nature_outdoors: 'Урок дня: Природа и отдых',
  general: 'Урок дня: Живой латышский',
};

const INVARIABLE_TOKENS = new Set([
  'ļoti',
  'šodien',
  'rīt',
  'vakar',
  'tagad',
  'vienmēr',
  'bieži',
  'pēc',
  'uz',
  'pa',
  'ar',
  'no',
  'pie',
  'un',
  'vai',
  'bet',
  'ka',
  'kur',
  'kad',
  'es',
  'tu',
  'mēs',
  'jūs',
  'rimi',
  'maxima',
]);

export function getTodayDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Riga',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function getYesterdayDateString(todayIso: string): string {
  const [y, m, d] = todayIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function selectNewWordsForToday(
  db: Database.Database,
  userId: number,
  dailyGoal: number
): WordRecord[] {
  const unlearned = db
    .prepare(
      `SELECT w.*
       FROM words w
       LEFT JOIN user_progress up
         ON up.word_id = w.id AND up.user_id = ?
       WHERE up.id IS NULL OR up.status = 'new'
       ORDER BY w.frequency_rank ASC
       LIMIT ?`
    )
    .all(userId, dailyGoal) as WordRecord[];

  if (unlearned.length >= dailyGoal) {
    return unlearned;
  }

  const chosenIds = new Set(unlearned.map((w) => w.id));
  const needed = dailyGoal - unlearned.length;
  const fallbackPool = db
    .prepare(
      `SELECT w.*
       FROM words w
       LEFT JOIN user_progress up
         ON up.word_id = w.id AND up.user_id = ?
       ORDER BY COALESCE(up.ease_factor, 2.5) ASC,
                COALESCE(up.last_reviewed_at, '1970-01-01') ASC,
                w.frequency_rank ASC
       LIMIT ?`
    )
    .all(userId, dailyGoal * 2) as WordRecord[];

  const combined = [...unlearned];
  for (const w of fallbackPool) {
    if (combined.length >= dailyGoal) break;
    if (!chosenIds.has(w.id)) {
      chosenIds.add(w.id);
      combined.push(w);
    }
    if (combined.length >= unlearned.length + needed) break;
  }
  return combined;
}

export function selectDueReviewPool(
  db: Database.Database,
  userId: number,
  excludeWordIds: number[],
  limit = 10
): DueWordRecord[] {
  const excluded = new Set(excludeWordIds);
  const rows = db
    .prepare(
      `SELECT
         w.*,
         up.status,
         up.ease_factor,
         up.times_seen,
         up.times_reused_in_ai,
         up.last_reviewed_at,
         CASE
           WHEN up.last_reviewed_at IS NULL THEN 100
           WHEN (julianday('now') - julianday(up.last_reviewed_at)) >= 14 THEN 3
           WHEN (julianday('now') - julianday(up.last_reviewed_at)) >= 7 THEN 2
           WHEN (julianday('now') - julianday(up.last_reviewed_at)) >= 3 THEN 1
           ELSE 0
         END AS due_priority
       FROM user_progress up
       JOIN words w ON w.id = up.word_id
       WHERE up.user_id = ?
         AND up.status IN ('learning', 'mastered')
       ORDER BY due_priority DESC,
                up.ease_factor ASC,
                COALESCE(up.last_reviewed_at, '1970-01-01') ASC,
                up.times_reused_in_ai ASC
       LIMIT ?`
    )
    .all(userId, limit + excludeWordIds.length) as DueWordRecord[];

  return rows.filter((row) => !excluded.has(row.id)).slice(0, limit);
}

export function createInitialCheckboxState(payload: SessionAiPayload): SessionCheckboxState {
  const words: SessionCheckboxState['words'] = {};
  for (const card of payload.word_cards) {
    words[String(card.word_id)] = {
      translation: false,
      pronunciation: false,
      forms: false,
    };
  }
  const puzzles_solved: Record<string, boolean> = {};
  for (const puzzle of payload.puzzles) {
    puzzles_solved[puzzle.id] = false;
  }
  return {
    words,
    synthesis_read: false,
    puzzles_solved,
  };
}

export function computeSessionStepCounts(
  payload: SessionAiPayload,
  state: SessionCheckboxState
): { completed_steps: number; total_steps: number } {
  const total_steps = payload.word_cards.length * 3 + 1 + payload.puzzles.length;
  let completed_steps = 0;
  for (const card of payload.word_cards) {
    const w = state.words[String(card.word_id)];
    if (w?.translation) completed_steps += 1;
    if (w?.pronunciation) completed_steps += 1;
    if (w?.forms) completed_steps += 1;
  }
  if (state.synthesis_read) completed_steps += 1;
  for (const p of payload.puzzles) {
    if (state.puzzles_solved[p.id]) completed_steps += 1;
  }
  return { completed_steps, total_steps };
}

export function findSurfaceTokenInSentence(sentence: string, lemma: string): string | null {
  const tokens = sentence.match(/[A-Za-zĀāČčĒēĢģĪīĶķĻļŅņŠšŪūŽž-]+/g) ?? [];
  const lowerLemma = lemma.toLowerCase();

  for (const tok of tokens) {
    if (tok.toLowerCase() === lowerLemma) {
      return tok;
    }
  }

  const stemLength = Math.max(2, lowerLemma.length - 2);
  const stem = lowerLemma.slice(0, stemLength);
  for (const tok of tokens) {
    const lowerTok = tok.toLowerCase();
    if (lowerTok.startsWith(stem) && Math.abs(lowerTok.length - lowerLemma.length) <= 4) {
      return tok;
    }
  }

  if (lowerLemma === 'būt') {
    const forms = new Set(['esmu', 'esi', 'ir', 'esam', 'esat', 'biju', 'biji', 'bija', 'būšu', 'būs']);
    for (const tok of tokens) {
      if (forms.has(tok.toLowerCase())) return tok;
    }
  }
  if (lowerLemma === 'iet') {
    const forms = new Set(['eju', 'ej', 'iet', 'ejam', 'ejat', 'gāju', 'gāja', 'iešu', 'ies']);
    for (const tok of tokens) {
      if (forms.has(tok.toLowerCase())) return tok;
    }
  }
  if (lowerLemma === 'pirkt') {
    const forms = new Set(['pērku', 'pērc', 'pērk', 'pērkam', 'pirku', 'nopirku', 'nopirka']);
    for (const tok of tokens) {
      if (forms.has(tok.toLowerCase())) return tok;
    }
  }
  if (lowerLemma === 'ēst') {
    const forms = new Set(['ēdu', 'ēd', 'ēdam', 'ēdīsim', 'ēdīšu']);
    for (const tok of tokens) {
      if (forms.has(tok.toLowerCase())) return tok;
    }
  }
  if (lowerLemma === 'dot') {
    const forms = new Set(['dodu', 'dod', 'dodam', 'devu', 'došu']);
    for (const tok of tokens) {
      if (forms.has(tok.toLowerCase())) return tok;
    }
  }

  return null;
}

function inferGrammarNoteRu(word: WordRecord, surfaceForm: string): string {
  const lowerSurface = surfaceForm.toLowerCase();
  const lowerLemma = word.latvian.toLowerCase();
  if (word.part_of_speech === 'сущ.') {
    if (lowerSurface === lowerLemma) {
      return `именительный падеж (kas?) ед. ч. от сущ. «${word.latvian}» (${word.russian})`;
    }
    if (lowerSurface.endsWith('ā') || lowerSurface.endsWith('ē') || lowerSurface.endsWith('ī') || lowerSurface.endsWith('ū')) {
      return `местный падеж (kur? — где?) ед. ч. от сущ. «${word.latvian}» (${word.russian})`;
    }
    if (lowerSurface.endsWith('u') || lowerSurface.endsWith('i')) {
      return `винительный падеж (ko? — кого/что?) от сущ. «${word.latvian}» (${word.russian})`;
    }
    if (lowerSurface.endsWith('am') || lowerSurface.endsWith('im') || lowerSurface.endsWith('ai') || lowerSurface.endsWith('ei')) {
      return `дательный падеж (kam? — кому/чему?) от сущ. «${word.latvian}» (${word.russian})`;
    }
    return `падежная форма от сущ. «${word.latvian}» (${word.russian})`;
  }
  if (word.part_of_speech === 'глаг.') {
    if (lowerSurface === lowerLemma) {
      return `инфинитив глагола «${word.latvian}» (${word.russian})`;
    }
    return `личная форма глагола «${word.latvian}» (${word.russian})`;
  }
  if (word.part_of_speech === 'прил.') {
    return `согласованная форма прил. «${word.latvian}» (${word.russian})`;
  }
  return `словарная форма «${word.latvian}» (${word.russian})`;
}

export function buildFallbackDistractors(
  token: string,
  matchedWord?: WordRecord
): Array<{ token: string; reason_ru: string }> {
  const clean = token.replace(/[.,!?;:«»"()]/g, '');
  const lower = clean.toLowerCase();
  if (lower.length <= 3 || INVARIABLE_TOKENS.has(lower)) {
    return [];
  }
  const isCapitalized = clean[0] && clean[0] === clean[0].toUpperCase();
  const applyCase = (val: string) =>
    isCapitalized ? val.charAt(0).toUpperCase() + val.slice(1) : val;

  const candidates: Array<{ token: string; reason_ru: string }> = [];

  if (lower.endsWith('ā') && lower.length > 3) {
    candidates.push({
      token: applyCase(lower.slice(0, -1) + 'u'),
      reason_ru: `«${lower.slice(0, -1) + 'u'}» — это винительный падеж (ko?), а здесь нужен местный падеж (kur? — где?) с окончанием -ā.`,
    });
    candidates.push({
      token: applyCase(lower.slice(0, -1) + 'a'),
      reason_ru: `«${lower.slice(0, -1) + 'a'}» — это начальная форма (именительный падеж), а по смыслу требуется местный падеж (kur?).`,
    });
  } else if (lower.endsWith('es') && lower.length > 4) {
    candidates.push({
      token: applyCase(lower.slice(0, -2) + 'e'),
      reason_ru: `«${lower.slice(0, -2) + 'e'}» — именительный падеж, а после предлога требуется родительный падеж («${clean}»).`,
    });
    candidates.push({
      token: applyCase(lower.slice(0, -2) + 'i'),
      reason_ru: `«${lower.slice(0, -2) + 'i'}» — винительный падеж (ko?), который не сочетается с конструкцией этого предложения.`,
    });
  } else if (lower.endsWith('as') && lower.length > 4) {
    candidates.push({
      token: applyCase(lower.slice(0, -2) + 'a'),
      reason_ru: `«${lower.slice(0, -2) + 'a'}» — именительный падеж ед. ч., тогда как здесь требуется форма «${clean}».`,
    });
    candidates.push({
      token: applyCase(lower.slice(0, -2) + 'u'),
      reason_ru: `«${lower.slice(0, -2) + 'u'}» — винительный падеж, не подходящий в этой позиции.`,
    });
  } else if (lower.endsWith('u') && lower.length > 3) {
    candidates.push({
      token: applyCase(lower.slice(0, -1) + 'ā'),
      reason_ru: `«${lower.slice(0, -1) + 'ā'}» — это местный падеж (где?), а здесь требуется винительный падеж (ko? / uz + вин. п.).`,
    });
    candidates.push({
      token: applyCase(lower.slice(0, -1) + 'a'),
      reason_ru: `«${lower.slice(0, -1) + 'a'}» — именительный или родительный падеж, который не согласуется с глаголом.`,
    });
  } else if (lower.endsWith('s') && lower.length > 4) {
    candidates.push({
      token: applyCase(lower.slice(0, -1) + 'ā'),
      reason_ru: `«${lower.slice(0, -1) + 'ā'}» стоит в местном падеже (где?), тогда как в предложении нужна форма «${clean}».`,
    });
    candidates.push({
      token: applyCase(lower.slice(0, -1) + 'u'),
      reason_ru: `«${lower.slice(0, -1) + 'u'}» — форма винительного падежа, не подходящая для этой грамматической роли.`,
    });
  } else if (lower.endsWith('a') && lower.length > 3) {
    candidates.push({
      token: applyCase(lower.slice(0, -1) + 'u'),
      reason_ru: `«${lower.slice(0, -1) + 'u'}» — винительный падеж (ko?), здесь нужна форма «${clean}».`,
    });
    candidates.push({
      token: applyCase(lower.slice(0, -1) + 'ā'),
      reason_ru: `«${lower.slice(0, -1) + 'ā'}» — местный падеж (kur?), он не подходит к структуре предложения.`,
    });
  } else if (matchedWord && matchedWord.latvian.toLowerCase() !== lower) {
    candidates.push({
      token: applyCase(matchedWord.latvian),
      reason_ru: `«${matchedWord.latvian}» — это несклонённая словарная форма; в предложении нужно изменить окончание на «${clean}».`,
    });
  }

  return candidates.filter((c) => c.token.toLowerCase() !== lower);
}

function buildFallbackSecondaryExample(
  word: WordRecord,
  reusedWord: DueWordRecord | undefined,
  theme: ContextTheme
): AnnotatedSentence {
  const themeLocLv =
    theme === 'riga_everyday'
      ? 'Rīgā'
      : theme === 'work_smalltalk'
        ? 'birojā'
        : theme === 'nature_outdoors'
          ? 'pie jūras'
          : 'ikdienā';
  const themeLocRu =
    theme === 'riga_everyday'
      ? 'в Риге'
      : theme === 'work_smalltalk'
        ? 'в офисе'
        : theme === 'nature_outdoors'
          ? 'у моря'
          : 'в повседневной жизни';

  if (reusedWord) {
    const lv = `${themeLocLv.charAt(0).toUpperCase() + themeLocLv.slice(1)} man bieži noder vārdi «${word.latvian}» un «${reusedWord.latvian}».`;
    const ru = `${themeLocRu.charAt(0).toUpperCase() + themeLocRu.slice(1)} мне часто пригождаются слова «${word.russian}» и «${reusedWord.russian}».`;
    return {
      lv,
      ru,
      annotations: [
        {
          surface_form: word.latvian,
          lemma: word.latvian,
          is_new: true,
          grammar_note_ru: `словарная форма (${word.part_of_speech}): ${word.grammar_note}`,
        },
        {
          surface_form: reusedWord.latvian,
          lemma: reusedWord.latvian,
          is_new: false,
          grammar_note_ru: `повторение изученного слова (${reusedWord.part_of_speech}): ${reusedWord.russian}`,
        },
      ],
    };
  }

  const lv = `${themeLocLv.charAt(0).toUpperCase() + themeLocLv.slice(1)} mēs bieži lietojam vārdu «${word.latvian}».`;
  const ru = `${themeLocRu.charAt(0).toUpperCase() + themeLocRu.slice(1)} мы часто используем слово «${word.russian}».`;
  return {
    lv,
    ru,
    annotations: [
      {
        surface_form: word.latvian,
        lemma: word.latvian,
        is_new: true,
        grammar_note_ru: `словарная форма (${word.part_of_speech}): ${word.grammar_note}`,
      },
    ],
  };
}

function buildStaticFallbackSession(
  newWords: WordRecord[],
  dueWords: DueWordRecord[],
  contextTheme: ContextTheme
): SessionAiPayload {
  const newWordIds = new Set(newWords.map((w) => w.id));
  const allPool: WordRecord[] = [...newWords, ...dueWords];

  const wordCards: SessionWordCard[] = newWords.map((word, index) => {
    const primaryAnnotations: TokenAnnotation[] = [];
    const seenSurfaces = new Set<string>();

    for (const candidate of allPool) {
      const surface = findSurfaceTokenInSentence(word.fallback_example_lv, candidate.latvian);
      if (surface && !seenSurfaces.has(surface.toLowerCase())) {
        seenSurfaces.add(surface.toLowerCase());
        primaryAnnotations.push({
          surface_form: surface,
          lemma: candidate.latvian,
          is_new: newWordIds.has(candidate.id),
          grammar_note_ru: inferGrammarNoteRu(candidate, surface),
        });
      }
    }

    if (primaryAnnotations.length === 0) {
      primaryAnnotations.push({
        surface_form: word.latvian,
        lemma: word.latvian,
        is_new: true,
        grammar_note_ru: word.grammar_note,
      });
    }

    const reusedForSecond = dueWords.length > 0 ? dueWords[index % dueWords.length] : undefined;
    const secondaryExample = buildFallbackSecondaryExample(word, reusedForSecond, contextTheme);

    return {
      word_id: word.id,
      frequency_rank: word.frequency_rank,
      latvian: word.latvian,
      russian: word.russian,
      part_of_speech: word.part_of_speech,
      grammar_note_ru: word.grammar_note,
      image_query: word.image_query,
      image_url: word.image_url,
      examples: [
        {
          lv: word.fallback_example_lv,
          ru: word.fallback_example_ru,
          annotations: primaryAnnotations,
        },
        secondaryExample,
      ],
    };
  });

  const synthesis: AnnotatedSentence[] = wordCards.slice(0, 3).map((card, idx) => ({
    speaker: idx % 2 === 0 ? 'Анна' : 'Янис',
    lv: card.examples[0].lv,
    ru: card.examples[0].ru,
    annotations: card.examples[0].annotations,
  }));

  const puzzles: SentencePuzzle[] = wordCards.slice(0, 2).map((card, idx) => {
    const baseSentence = card.examples[0];
    const cleanTokens = baseSentence.lv
      .replace(/[«»"()]/g, '')
      .trim()
      .split(/\s+/)
      .map((t) => t.replace(/[.,!?;:]+$/g, ''))
      .filter(Boolean);

    const distractorExplanations: DistractorExplanation[] = [];
    const seenDistractors = new Set(cleanTokens.map((t) => t.toLowerCase()));

    for (const token of cleanTokens) {
      if (distractorExplanations.length >= 3) break;
      const matched = allPool.find(
        (w) =>
          w.latvian.toLowerCase() === token.toLowerCase() ||
          token.toLowerCase().startsWith(w.latvian.toLowerCase().slice(0, 3))
      );
      const cands = buildFallbackDistractors(token, matched);
      for (const c of cands) {
        if (distractorExplanations.length >= 3) break;
        if (!seenDistractors.has(c.token.toLowerCase())) {
          seenDistractors.add(c.token.toLowerCase());
          distractorExplanations.push(c);
        }
      }
    }

    if (distractorExplanations.length === 0) {
      distractorExplanations.push(
        {
          token: 'vakarā',
          reason_ru: '«vakarā» (вечером) — лишнее обстоятельство времени, которого нет в исходном русском предложении.',
        },
        {
          token: 'mājās',
          reason_ru: '«mājās» (дома) — не подходит по смыслу к заданному переводу.',
        }
      );
    }

    return {
      id: `puzzle_${idx + 1}`,
      russian_prompt: baseSentence.ru,
      correct_tokens: cleanTokens,
      distractor_tokens: distractorExplanations.map((d) => d.token),
      distractor_explanations: distractorExplanations,
      grammar_summary_ru: `Обратите внимание на порядок слов и падежные окончания в слове «${card.latvian}».`,
    };
  });

  return {
    source: 'fallback',
    context_theme: contextTheme,
    session_title_ru: THEME_TITLES_RU[contextTheme],
    session_intro_ru:
      'Урок собран из частотного словаря с разбором форм слов и интерактивными заданиями.',
    reused_words: dueWords.map((w) => ({
      word_id: w.id,
      latvian: w.latvian,
      russian: w.russian,
      status: w.status,
    })),
    word_cards: wordCards,
    synthesis,
    puzzles,
  };
}

async function generateWithGemini(
  db: Database.Database,
  userId: number,
  newWords: WordRecord[],
  dueWords: DueWordRecord[],
  contextTheme: ContextTheme
): Promise<SessionAiPayload> {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  const newWordsBlock = newWords
    .map(
      (w) =>
        `- word_id=${w.id} | lv="${w.latvian}" | ru="${w.russian}" | pos="${w.part_of_speech}" | note="${w.grammar_note}"`
    )
    .join('\n');

  const dueWordsBlock =
    dueWords.length > 0
      ? dueWords
          .map(
            (w) =>
              `- word_id=${w.id} | lv="${w.latvian}" | ru="${w.russian}" | pos="${w.part_of_speech}" | status=${w.status}`
          )
          .join('\n')
      : '(Пока нет ранее изученных слов — это один из первых уроков ученика. Делай примеры максимально естественными и постепенно связывай новые слова между собой.)';

  const prompt = `Ты — выдающийся преподаватель латышского языка для русскоязычных учеников, живущих в Латвии.
Сформируй персональный ежедневный урок латышского языка в формате строгого JSON.

КОНТЕКСТ УРОКА (${contextTheme}):
${THEME_PROMPT_DETAILS[contextTheme]}

НОВЫЕ СЛОВА НА СЕГОДНЯ (${newWords.length} шт.):
${newWordsBlock}

СЛОВА ДЛЯ ИНТЕРВАЛЬНОГО ПОВТОРЕНИЯ (due_learned_words):
${dueWordsBlock}

СТРОГИЕ ПРАВИЛА ГЕНЕРАЦИИ:
1. Весь интерфейс, переводы, заголовки и грамматические пояснения должны быть на чистом, понятном РУССКОМ языке. Никогда не упоминай слова «ИИ», «AI», «нейросеть» или «ИИ-репетитор» в заголовках и описаниях урока. Весь латышский текст должен быть идеально грамотным с верной диакритикой (ā, č, ē, ģ, ī, ķ, ļ, ņ, š, ū, ž).
2. Для КАЖДОГО нового слова из списка выше создай объект в "word_cards" с точным "word_id", актуальным контекстным переводом на русский, краткой но ёмкой грамматической заметкой (род, склонение/спряжение, основные формы), коротким запросом на английском для фото (image_query, 2-4 слова) и ровно ДВУМЯ живыми латышскими предложениями ("examples").
3. ПРАВИЛО НАКОПЛЕНИЯ СЛОВАРЯ: Если список due_learned_words не пуст, постарайся естественно вплести 1–2 слова из due_learned_words в каждый пример (например, «suns» + «iela» -> «Suns iet pa ielu.»).
4. АННОТАЦИИ (annotations): В каждом предложении (и в word_cards, и в synthesis) обязательно перечисли все встретившиеся в нём новые слова урока (is_new: true) и повторённые слова из due_learned_words (is_new: false). Поле "surface_form" ДОЛЖНО точно совпадать со словом в тексте предложения "lv" (включая регистр или точное написание без знаков препинания). Поле "lemma" — словарная форма. Поле "grammar_note_ru" — конкретный разбор формы, например: «винительный падеж (ko?) ед. ч. от сущ. «iela» (улица) после предлога pa» или «1-е лицо ед. ч. наст. вр. от глаг. «pirkt» (покупать)».
5. ИТОГОВЫЙ СИНТЕЗ ("synthesis"): 3 связных предложения (можно оформить как короткий естественный мини-диалог двух людей с полями speaker, например «Анна» и «Янис»), объединяющих сразу несколько новых слов и слова на повторение в сценарии темы урока.
6. КОНСТРУКТОР ПРЕДЛОЖЕНИЙ ("puzzles"): 2 интерактивных задания на основе самых полезных предложений урока. В каждом:
   - "id": "puzzle_1" и "puzzle_2"
   - "russian_prompt": точный перевод на русский
   - "correct_tokens": массив латышских слов в правильном порядке (без конечной точки/вопросительного знака, чтобы ученик собирал чистые блоки слов; длина 4–8 слов)
   - "distractor_tokens": 2–3 правдоподобных слова-ловушки с неправильным падежом или формой глагола (например, "iela" и "ielā" рядом с правильным "ielu")
   - "distractor_explanations": массив объектов { "token", "reason_ru" } для КАЖДОГО слова из distractor_tokens, объясняющий по-русски, почему именно эта форма/падеж не подходит
   - "grammar_summary_ru": краткое пояснение ключевой грамматической конструкции предложения.`;

  const annotationSchema = {
    type: Type.OBJECT,
    properties: {
      surface_form: { type: Type.STRING },
      lemma: { type: Type.STRING },
      is_new: { type: Type.BOOLEAN },
      grammar_note_ru: { type: Type.STRING },
    },
    required: ['surface_form', 'lemma', 'is_new', 'grammar_note_ru'],
  };

  const sentenceSchema = {
    type: Type.OBJECT,
    properties: {
      speaker: { type: Type.STRING },
      lv: { type: Type.STRING },
      ru: { type: Type.STRING },
      annotations: {
        type: Type.ARRAY,
        items: annotationSchema,
      },
    },
    required: ['lv', 'ru', 'annotations'],
  };

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: prompt,
    config: {
      temperature: 0.7,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          session_title_ru: { type: Type.STRING },
          session_intro_ru: { type: Type.STRING },
          word_cards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word_id: { type: Type.INTEGER },
                latvian: { type: Type.STRING },
                russian: { type: Type.STRING },
                grammar_note_ru: { type: Type.STRING },
                image_query: { type: Type.STRING },
                examples: {
                  type: Type.ARRAY,
                  items: sentenceSchema,
                },
              },
              required: [
                'word_id',
                'latvian',
                'russian',
                'grammar_note_ru',
                'image_query',
                'examples',
              ],
            },
          },
          synthesis: {
            type: Type.ARRAY,
            items: sentenceSchema,
          },
          puzzles: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                russian_prompt: { type: Type.STRING },
                correct_tokens: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                distractor_tokens: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                distractor_explanations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      token: { type: Type.STRING },
                      reason_ru: { type: Type.STRING },
                    },
                    required: ['token', 'reason_ru'],
                  },
                },
                grammar_summary_ru: { type: Type.STRING },
              },
              required: [
                'id',
                'russian_prompt',
                'correct_tokens',
                'distractor_tokens',
                'distractor_explanations',
                'grammar_summary_ru',
              ],
            },
          },
        },
        required: ['session_title_ru', 'session_intro_ru', 'word_cards', 'synthesis', 'puzzles'],
      },
    },
  });

  recordGeminiUsage(db, {
    userId,
    operation: 'daily_session',
    model: config.geminiModel,
    usageMetadata: response.usageMetadata,
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error('Empty response from Gemini');
  }

  const parsed = JSON.parse(rawText) as {
    session_title_ru: string;
    session_intro_ru: string;
    word_cards: Array<{
      word_id: number;
      latvian: string;
      russian: string;
      grammar_note_ru: string;
      image_query: string;
      examples: AnnotatedSentence[];
    }>;
    synthesis: AnnotatedSentence[];
    puzzles: SentencePuzzle[];
  };

  const wordById = new Map(newWords.map((w) => [w.id, w]));
  const cardById = new Map(parsed.word_cards.map((c) => [c.word_id, c]));

  const normalizedCards: SessionWordCard[] = newWords.map((w) => {
    const aiCard =
      cardById.get(w.id) ||
      parsed.word_cards.find((c) => c.latvian.toLowerCase() === w.latvian.toLowerCase());

    if (!aiCard) {
      return {
        word_id: w.id,
        frequency_rank: w.frequency_rank,
        latvian: w.latvian,
        russian: w.russian,
        part_of_speech: w.part_of_speech,
        grammar_note_ru: w.grammar_note,
        image_query: w.image_query,
        image_url: w.image_url,
        examples: [
          {
            lv: w.fallback_example_lv,
            ru: w.fallback_example_ru,
            annotations: [
              {
                surface_form: findSurfaceTokenInSentence(w.fallback_example_lv, w.latvian) || w.latvian,
                lemma: w.latvian,
                is_new: true,
                grammar_note_ru: w.grammar_note,
              },
            ],
          },
        ],
      };
    }

    const base = wordById.get(w.id) || w;
    return {
      word_id: base.id,
      frequency_rank: base.frequency_rank,
      latvian: base.latvian,
      russian: aiCard.russian || base.russian,
      part_of_speech: base.part_of_speech,
      grammar_note_ru: aiCard.grammar_note_ru || base.grammar_note,
      image_query: aiCard.image_query || base.image_query,
      image_url: base.image_url,
      examples: (aiCard.examples || []).slice(0, 2),
    };
  });

  const normalizedPuzzles = (parsed.puzzles || []).slice(0, 2).map((p, idx) => ({
    ...p,
    id: p.id || `puzzle_${idx + 1}`,
    correct_tokens: p.correct_tokens.map((t) => t.trim()).filter(Boolean),
    distractor_tokens: p.distractor_tokens.map((t) => t.trim()).filter(Boolean),
  }));

  return {
    source: 'gemini',
    context_theme: contextTheme,
    session_title_ru: parsed.session_title_ru || THEME_TITLES_RU[contextTheme],
    session_intro_ru:
      parsed.session_intro_ru ||
      'Персональный урок: новые слова вплетены в живые ситуации и объединены с вашим словарным запасом.',
    reused_words: dueWords.map((w) => ({
      word_id: w.id,
      latvian: w.latvian,
      russian: w.russian,
      status: w.status,
    })),
    word_cards: normalizedCards,
    synthesis: (parsed.synthesis || []).slice(0, 3),
    puzzles: normalizedPuzzles,
  };
}

function recordReusedWordsUsage(
  db: Database.Database,
  userId: number,
  dueWords: DueWordRecord[],
  payload: SessionAiPayload
): void {
  if (dueWords.length === 0) return;

  const usedLemmas = new Set<string>();
  for (const card of payload.word_cards) {
    for (const ex of card.examples) {
      for (const ann of ex.annotations) {
        if (!ann.is_new) usedLemmas.add(ann.lemma.toLowerCase());
      }
    }
  }
  for (const syn of payload.synthesis) {
    for (const ann of syn.annotations) {
      if (!ann.is_new) usedLemmas.add(ann.lemma.toLowerCase());
    }
  }

  const reusedIds = dueWords
    .filter((w) => usedLemmas.size === 0 || usedLemmas.has(w.latvian.toLowerCase()))
    .map((w) => w.id);

  if (reusedIds.length === 0) return;

  const stmt = db.prepare(
    `UPDATE user_progress
     SET times_reused_in_ai = times_reused_in_ai + 1,
         last_reviewed_at = datetime('now')
     WHERE user_id = ? AND word_id = ?`
  );

  const tx = db.transaction((ids: number[]) => {
    for (const id of ids) {
      stmt.run(userId, id);
    }
  });
  tx(reusedIds);
}

async function hydrateCardImages(
  db: Database.Database,
  payload: SessionAiPayload
): Promise<SessionAiPayload> {
  await Promise.all(
    payload.word_cards.map(async (card) => {
      const url = await ensureWordImage(
        db,
        {
          id: card.word_id,
          image_url: card.image_url,
          image_query: card.image_query,
        },
        card.image_query
      );
      card.image_url = url;
    })
  );
  return payload;
}

function rowToResponse(
  db: Database.Database,
  row: DailySessionRow,
  userId: number
): DailySessionResponse {
  const today = getTodayDateString();
  return {
    id: row.id,
    session_date: row.session_date,
    context_theme: row.context_theme,
    is_completed: Boolean(row.is_completed),
    is_today: row.session_date === today,
    ai_payload: JSON.parse(row.ai_payload_json) as SessionAiPayload,
    checkbox_state: JSON.parse(row.checkbox_state_json) as SessionCheckboxState,
    stats: getUserDashboardStats(db, userId),
  };
}

export function getTodaySessionEnvelope(
  db: Database.Database,
  user: UserProfile
): TodaySessionEnvelope {
  const today = getTodayDateString();
  const existing = db
    .prepare('SELECT * FROM daily_sessions WHERE user_id = ? AND session_date = ?')
    .get(user.id, today) as DailySessionRow | undefined;

  if (!existing) {
    return {
      prepared: false,
      today_date: today,
      session: null,
      stats: getUserDashboardStats(db, user.id),
    };
  }

  const session = rowToResponse(db, existing, user.id);
  return {
    prepared: true,
    today_date: today,
    session,
    stats: session.stats,
  };
}

export async function prepareTodaySession(
  db: Database.Database,
  user: UserProfile,
  options?: { forceRegenerate?: boolean }
): Promise<DailySessionResponse> {
  const today = getTodayDateString();
  const existing = db
    .prepare('SELECT * FROM daily_sessions WHERE user_id = ? AND session_date = ?')
    .get(user.id, today) as DailySessionRow | undefined;

  if (existing && !options?.forceRegenerate) {
    return rowToResponse(db, existing, user.id);
  }

  const newWords = selectNewWordsForToday(db, user.id, user.daily_goal);
  const dueWords = selectDueReviewPool(
    db,
    user.id,
    newWords.map((w) => w.id),
    10
  );

  let payload: SessionAiPayload;
  if (config.geminiApiKey) {
    try {
      payload = await generateWithGemini(db, user.id, newWords, dueWords, user.context_theme);
    } catch (err) {
      console.error('Gemini session generation failed, falling back to static DB session:', err);
      payload = buildStaticFallbackSession(newWords, dueWords, user.context_theme);
    }
  } else {
    payload = buildStaticFallbackSession(newWords, dueWords, user.context_theme);
  }

  payload = await hydrateCardImages(db, payload);
  recordReusedWordsUsage(db, user.id, dueWords, payload);

  const checkboxState = createInitialCheckboxState(payload);
  const wordIdsJson = JSON.stringify(newWords.map((w) => w.id));
  const aiPayloadJson = JSON.stringify(payload);
  const checkboxStateJson = JSON.stringify(checkboxState);

  if (existing) {
    db.prepare(
      `UPDATE daily_sessions
       SET context_theme = ?,
           word_ids_json = ?,
           ai_payload_json = ?,
           checkbox_state_json = ?,
           is_completed = 0,
           created_at = datetime('now')
       WHERE id = ?`
    ).run(user.context_theme, wordIdsJson, aiPayloadJson, checkboxStateJson, existing.id);
  } else {
    db.prepare(
      `INSERT INTO daily_sessions (
         user_id,
         session_date,
         context_theme,
         word_ids_json,
         ai_payload_json,
         checkbox_state_json,
         is_completed
       )
       VALUES (?, ?, ?, ?, ?, ?, 0)`
    ).run(
      user.id,
      today,
      user.context_theme,
      wordIdsJson,
      aiPayloadJson,
      checkboxStateJson
    );
  }

  const saved = db
    .prepare('SELECT * FROM daily_sessions WHERE user_id = ? AND session_date = ?')
    .get(user.id, today) as DailySessionRow;

  return rowToResponse(db, saved, user.id);
}

export function listUserSessions(
  db: Database.Database,
  userId: number
): SessionHistoryItem[] {
  const rows = db
    .prepare(
      `SELECT *
       FROM daily_sessions
       WHERE user_id = ?
       ORDER BY session_date DESC`
    )
    .all(userId) as DailySessionRow[];

  return rows.map((row) => {
    const payload = JSON.parse(row.ai_payload_json) as SessionAiPayload;
    const state = JSON.parse(row.checkbox_state_json) as SessionCheckboxState;
    const counts = computeSessionStepCounts(payload, state);
    return {
      id: row.id,
      session_date: row.session_date,
      context_theme: row.context_theme,
      session_title_ru: payload.session_title_ru,
      source: payload.source,
      is_completed: Boolean(row.is_completed),
      word_count: payload.word_cards.length,
      words_preview: payload.word_cards.map((c) => ({
        word_id: c.word_id,
        latvian: c.latvian,
        russian: c.russian,
      })),
      completed_steps: counts.completed_steps,
      total_steps: counts.total_steps,
      created_at: row.created_at,
    };
  });
}

export function getSessionById(
  db: Database.Database,
  userId: number,
  sessionId: number
): DailySessionResponse | null {
  const row = db
    .prepare('SELECT * FROM daily_sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, userId) as DailySessionRow | undefined;
  if (!row) return null;
  return rowToResponse(db, row, userId);
}

export function resetSessionForRelearn(
  db: Database.Database,
  userId: number,
  sessionId: number
): DailySessionResponse {
  const row = db
    .prepare('SELECT * FROM daily_sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, userId) as DailySessionRow | undefined;

  if (!row) {
    throw new Error('Урок не найден');
  }

  const payload = JSON.parse(row.ai_payload_json) as SessionAiPayload;
  const freshState = createInitialCheckboxState(payload);

  db.prepare('UPDATE daily_sessions SET checkbox_state_json = ? WHERE id = ?').run(
    JSON.stringify(freshState),
    row.id
  );

  const updated = db
    .prepare('SELECT * FROM daily_sessions WHERE id = ?')
    .get(row.id) as DailySessionRow;

  return rowToResponse(db, updated, userId);
}

export function updateSessionCheckboxState(
  db: Database.Database,
  userId: number,
  patch: {
    session_id?: number;
    type: 'word' | 'synthesis' | 'puzzle';
    word_id?: number;
    field?: 'translation' | 'pronunciation' | 'forms';
    puzzle_id?: string;
    value: boolean;
  }
): DailySessionResponse {
  let row: DailySessionRow | undefined;
  if (patch.session_id) {
    row = db
      .prepare('SELECT * FROM daily_sessions WHERE id = ? AND user_id = ?')
      .get(patch.session_id, userId) as DailySessionRow | undefined;
  } else {
    const today = getTodayDateString();
    row = db
      .prepare('SELECT * FROM daily_sessions WHERE user_id = ? AND session_date = ?')
      .get(userId, today) as DailySessionRow | undefined;
  }

  if (!row) {
    throw new Error('Урок не найден');
  }

  const state = JSON.parse(row.checkbox_state_json) as SessionCheckboxState;

  if (patch.type === 'word' && patch.word_id !== undefined && patch.field) {
    const key = String(patch.word_id);
    if (!state.words[key]) {
      state.words[key] = { translation: false, pronunciation: false, forms: false };
    }
    state.words[key][patch.field] = Boolean(patch.value);
  } else if (patch.type === 'synthesis') {
    state.synthesis_read = Boolean(patch.value);
  } else if (patch.type === 'puzzle' && patch.puzzle_id) {
    state.puzzles_solved[patch.puzzle_id] = Boolean(patch.value);
  }

  db.prepare('UPDATE daily_sessions SET checkbox_state_json = ? WHERE id = ?').run(
    JSON.stringify(state),
    row.id
  );

  const updated = db
    .prepare('SELECT * FROM daily_sessions WHERE id = ?')
    .get(row.id) as DailySessionRow;

  return rowToResponse(db, updated, userId);
}

export function isSessionReadyToComplete(
  payload: SessionAiPayload,
  state: SessionCheckboxState
): boolean {
  for (const card of payload.word_cards) {
    const w = state.words[String(card.word_id)];
    if (!w || !w.translation || !w.pronunciation || !w.forms) {
      return false;
    }
  }
  if (!state.synthesis_read) {
    return false;
  }
  for (const puzzle of payload.puzzles) {
    if (!state.puzzles_solved[puzzle.id]) {
      return false;
    }
  }
  return true;
}

export function completeSession(
  db: Database.Database,
  user: UserProfile,
  sessionId?: number
): DailySessionResponse {
  const today = getTodayDateString();
  const row = sessionId
    ? (db
        .prepare('SELECT * FROM daily_sessions WHERE id = ? AND user_id = ?')
        .get(sessionId, user.id) as DailySessionRow | undefined)
    : (db
        .prepare('SELECT * FROM daily_sessions WHERE user_id = ? AND session_date = ?')
        .get(user.id, today) as DailySessionRow | undefined);

  if (!row) {
    throw new Error('Урок не найден');
  }

  const payload = JSON.parse(row.ai_payload_json) as SessionAiPayload;
  const state = JSON.parse(row.checkbox_state_json) as SessionCheckboxState;

  if (!isSessionReadyToComplete(payload, state)) {
    throw new Error('Выполните все шаги урока и соберите предложения, чтобы завершить тренировку');
  }

  const wordIds = JSON.parse(row.word_ids_json) as number[];
  const alreadyCompleted = Boolean(row.is_completed);

  const tx = db.transaction(() => {
    const selectProgress = db.prepare(
      'SELECT * FROM user_progress WHERE user_id = ? AND word_id = ?'
    );
    const insertProgress = db.prepare(
      `INSERT INTO user_progress (user_id, word_id, status, ease_factor, times_seen, times_reused_in_ai, last_reviewed_at)
       VALUES (?, ?, 'learning', 2.5, 1, 0, datetime('now'))`
    );
    const updateProgress = db.prepare(
      `UPDATE user_progress
       SET status = ?,
           ease_factor = ?,
           times_seen = times_seen + 1,
           last_reviewed_at = datetime('now')
       WHERE id = ?`
    );

    for (const wordId of wordIds) {
      const existing = selectProgress.get(user.id, wordId) as
        | { id: number; status: WordStatus; ease_factor: number; times_seen: number }
        | undefined;
      if (!existing) {
        insertProgress.run(user.id, wordId);
      } else {
        const nextTimes = existing.times_seen + 1;
        const nextEase = Math.min(3.0, Number((existing.ease_factor + 0.15).toFixed(2)));
        const nextStatus: WordStatus =
          nextTimes >= 2 || existing.status === 'mastered' ? 'mastered' : 'learning';
        updateProgress.run(nextStatus, nextEase, existing.id);
      }
    }

    for (const reused of payload.reused_words) {
      const existing = selectProgress.get(user.id, reused.word_id) as
        | { id: number; status: WordStatus; ease_factor: number; times_seen: number }
        | undefined;
      if (existing) {
        const nextEase = Math.min(3.0, Number((existing.ease_factor + 0.1).toFixed(2)));
        const nextStatus: WordStatus =
          existing.times_seen >= 2 || existing.status === 'mastered' ? 'mastered' : 'learning';
        updateProgress.run(nextStatus, nextEase, existing.id);
      }
    }

    if (!alreadyCompleted && row.session_date === today) {
      const yesterday = getYesterdayDateString(today);
      const nextStreak =
        user.last_completed_date === today
          ? user.streak_count
          : user.last_completed_date === yesterday
            ? user.streak_count + 1
            : 1;

      db.prepare(
        'UPDATE users SET streak_count = ?, last_completed_date = ? WHERE id = ?'
      ).run(nextStreak, today, user.id);
    }

    db.prepare('UPDATE daily_sessions SET is_completed = 1 WHERE id = ?').run(row.id);
  });

  tx();

  const updated = db
    .prepare('SELECT * FROM daily_sessions WHERE id = ?')
    .get(row.id) as DailySessionRow;

  return rowToResponse(db, updated, user.id);
}
