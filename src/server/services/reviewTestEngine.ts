import { GoogleGenAI, Type } from '@google/genai';
import type Database from 'better-sqlite3';
import { config } from '../config.js';
import { getUserDashboardStats, getWordsByIds } from '../db.js';
import { recordGeminiUsage } from './adminService.js';
import {
  buildFallbackDistractors,
  findSurfaceTokenInSentence,
} from './sessionEngine.js';
import type {
  DistractorExplanation,
  ReviewTestAnswers,
  ReviewTestHistoryItem,
  ReviewTestPayload,
  ReviewTestQuestion,
  ReviewTestResponse,
  SentencePuzzle,
  UserProfile,
  WordRecord,
  WordStatus,
} from '../../shared/types.js';

interface ReviewTestRow {
  id: number;
  user_id: number;
  source_session_ids_json: string;
  word_ids_json: string;
  test_payload_json: string;
  answers_json: string;
  score: number | null;
  max_score: number;
  is_completed: number;
  created_at: string;
  completed_at: string | null;
}

interface CompletedSessionSummary {
  id: number;
  session_date: string;
  word_ids_json: string;
}

function deterministicRotate<T>(items: T[], seed: number): T[] {
  if (items.length <= 1) return [...items];
  const arr = [...items];
  let s = seed >>> 0;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function buildFallbackSummaryTest(
  words: WordRecord[],
  coveredDates: string[],
  allDictionaryWords: WordRecord[]
): ReviewTestPayload {
  const pool = allDictionaryWords.length >= 10 ? allDictionaryWords : words;
  const meaningWords = words.slice(0, Math.min(5, words.length));
  const caseWords = words.slice(
    Math.min(5, Math.max(0, words.length - 4)),
    Math.min(9, words.length)
  );

  const questions: ReviewTestQuestion[] = [];

  meaningWords.forEach((word, idx) => {
    const distractors = pool
      .filter((w) => w.id !== word.id && w.russian.toLowerCase() !== word.russian.toLowerCase())
      .slice(idx * 2, idx * 2 + 12)
      .filter((w, i, arr) => arr.findIndex((x) => x.russian === w.russian) === i)
      .slice(0, 3)
      .map((w) => w.russian);

    const rawOptions = [word.russian, ...distractors];
    const shuffled = deterministicRotate(rawOptions, word.id * 97 + idx * 13);
    const correctIndex = shuffled.indexOf(word.russian);

    questions.push({
      id: `q_meaning_${idx + 1}`,
      kind: 'context_meaning',
      word_id: word.id,
      latvian_word: word.latvian,
      prompt_lv: word.fallback_example_lv,
      prompt_ru: `Выберите точный перевод слова «${word.latvian}» в этом предложении:`,
      options: shuffled,
      correct_index: correctIndex,
      explanation_ru: `«${word.latvian}» (${word.part_of_speech}) переводится как «${word.russian}». ${word.grammar_note}`,
    });
  });

  caseWords.forEach((word, idx) => {
    const surface =
      findSurfaceTokenInSentence(word.fallback_example_lv, word.latvian) || word.latvian;
    const wrongForms = buildFallbackDistractors(surface, word).map((d) => d.token);

    if (wrongForms.length < 2 && word.latvian.toLowerCase() !== surface.toLowerCase()) {
      wrongForms.push(word.latvian);
    }
    const extraFallbacks = pool
      .filter((w) => w.id !== word.id && w.part_of_speech === word.part_of_speech)
      .slice(idx, idx + 4)
      .map((w) => w.latvian);

    const uniqueWrong: string[] = [];
    for (const f of [...wrongForms, ...extraFallbacks]) {
      if (
        f.toLowerCase() !== surface.toLowerCase() &&
        !uniqueWrong.some((u) => u.toLowerCase() === f.toLowerCase())
      ) {
        uniqueWrong.push(f);
      }
      if (uniqueWrong.length >= 3) break;
    }

    const options = deterministicRotate([surface, ...uniqueWrong], word.id * 53 + idx * 19);
    const correctIndex = options.indexOf(surface);
    const maskedSentence = word.fallback_example_lv.replace(surface, '_____');

    questions.push({
      id: `q_case_${idx + 1}`,
      kind: 'case_choice',
      word_id: word.id,
      latvian_word: word.latvian,
      prompt_lv: maskedSentence,
      prompt_ru: `Подставьте верную форму слова «${word.latvian}» (${word.russian}). Перевод: «${word.fallback_example_ru}»`,
      options,
      correct_index: correctIndex,
      explanation_ru: `Правильная форма — «${surface}». ${word.grammar_note}`,
    });
  });

  const puzzleSourceWords = words.slice(0, Math.min(2, words.length));
  const puzzles: SentencePuzzle[] = puzzleSourceWords.map((word, idx) => {
    const cleanTokens = word.fallback_example_lv
      .replace(/[«»"()]/g, '')
      .trim()
      .split(/\s+/)
      .map((t) => t.replace(/[.,!?;:]+$/g, ''))
      .filter(Boolean);

    const distractorExplanations: DistractorExplanation[] = [];
    const seen = new Set(cleanTokens.map((t) => t.toLowerCase()));
    for (const tok of cleanTokens) {
      if (distractorExplanations.length >= 3) break;
      const cands = buildFallbackDistractors(tok, word);
      for (const c of cands) {
        if (distractorExplanations.length >= 3) break;
        if (!seen.has(c.token.toLowerCase())) {
          seen.add(c.token.toLowerCase());
          distractorExplanations.push(c);
        }
      }
    }

    if (distractorExplanations.length === 0) {
      distractorExplanations.push(
        {
          token: 'vakar',
          reason_ru: '«vakar» (вчера) не соответствует смыслу исходного предложения.',
        },
        {
          token: 'mājās',
          reason_ru: '«mājās» (дома) лишнее для заданного перевода.',
        }
      );
    }

    return {
      id: `exam_puzzle_${idx + 1}`,
      russian_prompt: word.fallback_example_ru,
      correct_tokens: cleanTokens,
      distractor_tokens: distractorExplanations.map((d) => d.token),
      distractor_explanations: distractorExplanations,
      grammar_summary_ru: `Закрепление слова «${word.latvian}» (${word.russian}) из последних 5 уроков.`,
    };
  });

  return {
    source: 'fallback',
    title_ru: 'Итоговый тест за 5 уроков',
    intro_ru: `Проверка всех слов из 5 пройденных уроков (${coveredDates[coveredDates.length - 1]} — ${coveredDates[0]}): перевод в контексте, выбор падежей и сборка предложений.`,
    covered_dates: coveredDates,
    covered_words: words.map((w) => ({
      word_id: w.id,
      latvian: w.latvian,
      russian: w.russian,
    })),
    questions,
    puzzles,
  };
}

async function generateSummaryTestWithGemini(
  db: Database.Database,
  userId: number,
  words: WordRecord[],
  coveredDates: string[]
): Promise<ReviewTestPayload> {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const wordsBlock = words
    .map(
      (w) =>
        `- word_id=${w.id} | lv="${w.latvian}" | ru="${w.russian}" | pos="${w.part_of_speech}" | note="${w.grammar_note}"`
    )
    .join('\n');

  const prompt = `Ты — опытный экзаменатор и преподаватель латышского языка для русскоязычных учеников.
Ученик завершил 5 ежедневных уроков (${coveredDates.join(', ')}) и проходит ИТОГОВЫЙ ПРОВЕРОЧНЫЙ ТЕСТ по всем словам из этих 5 уроков.

СЛОВА ИЗ 5 ПРОЙДЕННЫХ УРОКОВ (${words.length} шт.):
${wordsBlock}

СОСТАВЬ ИТОГОВЫЙ ТЕСТ В ФОРМАТЕ СТРОГОГО JSON:
1. Весь интерфейс, инструкции и объяснения должны быть на чистом РУССКОМ языке. Никогда не упоминай слова «ИИ», «AI», «нейросеть» или «ИИ-репетитор» в заголовке и описании теста. Все латышские предложения и варианты должны быть идеально грамотными с диакритикой (ā, č, ē, ģ, ī, ķ, ļ, ņ, š, ū, ž).
2. "questions": ровно 8–10 вопросов (постарайся охватить слова из разных дней):
   - Первые 4–5 вопросов с "kind": "context_meaning": живое латышское предложение ("prompt_lv"), объединяющее 2–3 слова из списка выше; "prompt_ru" спрашивает перевод целевого слова в контексте; 4 варианта ответа на русском ("options"), индекс верного ("correct_index", 0..3) и подробное объяснение ("explanation_ru").
   - Следующие 4–5 вопросов с "kind": "case_choice": латышское предложение с пропуском "_____" ("prompt_lv") и русским переводом-подсказкой ("prompt_ru"); 4 варианта латышских форм одного слова в разных падежах/временах ("options", например ["iela", "ielu", "ielā", "ielas"]), индекс верного ("correct_index", 0..3) и чёткое объяснение на русском, почему нужен именно этот падеж или форма глагола ("explanation_ru").
   - Для каждого вопроса укажи точный "word_id" и "latvian_word" из списка выше.
3. "puzzles": 2 синтетических задания на сборку предложения из блоков ("id": "exam_puzzle_1", "exam_puzzle_2"), каждое из которых объединяет по 2–3 слова из разных уроков списка. Укажи "russian_prompt", "correct_tokens", 2–3 неверные падежные/глагольные формы в "distractor_tokens", подробные объяснения в "distractor_explanations" и "grammar_summary_ru".`;

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: prompt,
    config: {
      temperature: 0.65,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title_ru: { type: Type.STRING },
          intro_ru: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                kind: { type: Type.STRING },
                word_id: { type: Type.INTEGER },
                latvian_word: { type: Type.STRING },
                prompt_lv: { type: Type.STRING },
                prompt_ru: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correct_index: { type: Type.INTEGER },
                explanation_ru: { type: Type.STRING },
              },
              required: [
                'id',
                'kind',
                'word_id',
                'latvian_word',
                'prompt_lv',
                'prompt_ru',
                'options',
                'correct_index',
                'explanation_ru',
              ],
            },
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
        required: ['title_ru', 'intro_ru', 'questions', 'puzzles'],
      },
    },
  });

  recordGeminiUsage(db, {
    userId,
    operation: 'summary_test',
    model: config.geminiModel,
    usageMetadata: response.usageMetadata,
  });

  const rawText = response.text;
  if (!rawText) throw new Error('Empty Gemini review test response');

  const parsed = JSON.parse(rawText) as {
    title_ru: string;
    intro_ru: string;
    questions: ReviewTestQuestion[];
    puzzles: SentencePuzzle[];
  };

  const validQuestions: ReviewTestQuestion[] = (parsed.questions || [])
    .filter((q) => Array.isArray(q.options) && q.options.length >= 2)
    .map((q, idx) => ({
      ...q,
      id: q.id || `q_${idx + 1}`,
      kind: q.kind === 'case_choice' ? 'case_choice' : 'context_meaning',
      correct_index: Math.max(0, Math.min(q.options.length - 1, q.correct_index)),
    }));

  const validPuzzles: SentencePuzzle[] = (parsed.puzzles || []).slice(0, 2).map((p, idx) => ({
    ...p,
    id: p.id || `exam_puzzle_${idx + 1}`,
    correct_tokens: p.correct_tokens.map((t) => t.trim()).filter(Boolean),
    distractor_tokens: p.distractor_tokens.map((t) => t.trim()).filter(Boolean),
  }));

  if (validQuestions.length === 0) {
    throw new Error('Gemini produced no valid questions');
  }

  return {
    source: 'gemini',
    title_ru: parsed.title_ru || 'Итоговый тест за 5 уроков',
    intro_ru:
      parsed.intro_ru ||
      'Персональный итоговый тест, объединяющий лексику и грамматику ваших последних 5 уроков.',
    covered_dates: coveredDates,
    covered_words: words.map((w) => ({
      word_id: w.id,
      latvian: w.latvian,
      russian: w.russian,
    })),
    questions: validQuestions,
    puzzles: validPuzzles,
  };
}

function rowToReviewTestResponse(
  db: Database.Database,
  row: ReviewTestRow,
  userId: number
): ReviewTestResponse {
  return {
    id: row.id,
    source_session_ids: JSON.parse(row.source_session_ids_json) as number[],
    payload: JSON.parse(row.test_payload_json) as ReviewTestPayload,
    answers: JSON.parse(row.answers_json) as ReviewTestAnswers,
    score: row.score,
    max_score: row.max_score,
    is_completed: Boolean(row.is_completed),
    created_at: row.created_at,
    completed_at: row.completed_at,
    stats: getUserDashboardStats(db, userId),
  };
}

export function listUserReviewTests(
  db: Database.Database,
  userId: number
): ReviewTestHistoryItem[] {
  const rows = db
    .prepare(
      `SELECT *
       FROM review_tests
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(userId) as ReviewTestRow[];

  return rows.map((row) => {
    const payload = JSON.parse(row.test_payload_json) as ReviewTestPayload;
    const wordIds = JSON.parse(row.word_ids_json) as number[];
    return {
      id: row.id,
      title_ru: payload.title_ru,
      covered_dates: payload.covered_dates,
      word_count: wordIds.length,
      score: row.score,
      max_score: row.max_score,
      is_completed: Boolean(row.is_completed),
      created_at: row.created_at,
      completed_at: row.completed_at,
    };
  });
}

export function getReviewTestById(
  db: Database.Database,
  userId: number,
  testId: number
): ReviewTestResponse | null {
  const row = db
    .prepare('SELECT * FROM review_tests WHERE id = ? AND user_id = ?')
    .get(testId, userId) as ReviewTestRow | undefined;
  if (!row) return null;
  return rowToReviewTestResponse(db, row, userId);
}

export async function prepareSummaryReviewTest(
  db: Database.Database,
  user: UserProfile,
  options?: { forceNew?: boolean }
): Promise<ReviewTestResponse> {
  if (!options?.forceNew) {
    const active = db
      .prepare(
        `SELECT *
         FROM review_tests
         WHERE user_id = ? AND is_completed = 0
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(user.id) as ReviewTestRow | undefined;
    if (active) {
      return rowToReviewTestResponse(db, active, user.id);
    }
  }

  const completedSessions = db
    .prepare(
      `SELECT id, session_date, word_ids_json
       FROM daily_sessions
       WHERE user_id = ? AND is_completed = 1
       ORDER BY session_date DESC`
    )
    .all(user.id) as CompletedSessionSummary[];

  if (completedSessions.length < 5) {
    throw new Error(
      `Итоговый тест открывается после 5 завершённых уроков (сейчас завершено: ${completedSessions.length} из 5).`
    );
  }

  const completedTests = db
    .prepare(
      `SELECT source_session_ids_json
       FROM review_tests
       WHERE user_id = ? AND is_completed = 1`
    )
    .all(user.id) as Array<{ source_session_ids_json: string }>;

  const alreadyTestedIds = new Set<number>();
  for (const t of completedTests) {
    try {
      const ids = JSON.parse(t.source_session_ids_json) as number[];
      for (const id of ids) alreadyTestedIds.add(id);
    } catch {
      continue;
    }
  }

  const untested = completedSessions.filter((s) => !alreadyTestedIds.has(s.id));
  const targetSessions =
    untested.length >= 5 ? untested.slice(0, 5) : completedSessions.slice(0, 5);

  const uniqueWordIds: number[] = [];
  const seenWords = new Set<number>();
  for (const s of targetSessions) {
    const ids = JSON.parse(s.word_ids_json) as number[];
    for (const id of ids) {
      if (!seenWords.has(id)) {
        seenWords.add(id);
        uniqueWordIds.push(id);
      }
    }
  }

  const words = getWordsByIds(db, uniqueWordIds);
  const coveredDates = targetSessions.map((s) => s.session_date);

  let payload: ReviewTestPayload;
  if (config.geminiApiKey) {
    try {
      payload = await generateSummaryTestWithGemini(db, user.id, words, coveredDates);
    } catch (err) {
      console.error('Gemini summary test generation failed, falling back to static test:', err);
      const allDictWords = db
        .prepare('SELECT * FROM words ORDER BY frequency_rank ASC LIMIT 60')
        .all() as WordRecord[];
      payload = buildFallbackSummaryTest(words, coveredDates, allDictWords);
    }
  } else {
    const allDictWords = db
      .prepare('SELECT * FROM words ORDER BY frequency_rank ASC LIMIT 60')
      .all() as WordRecord[];
    payload = buildFallbackSummaryTest(words, coveredDates, allDictWords);
  }

  const initialAnswers: ReviewTestAnswers = {
    choices: {},
    puzzles_solved: Object.fromEntries(payload.puzzles.map((p) => [p.id, false])),
  };
  const maxScore = payload.questions.length + payload.puzzles.length;

  const inserted = db
    .prepare(
      `INSERT INTO review_tests (
         user_id,
         source_session_ids_json,
         word_ids_json,
         test_payload_json,
         answers_json,
         score,
         max_score,
         is_completed
       )
       VALUES (?, ?, ?, ?, ?, NULL, ?, 0)`
    )
    .run(
      user.id,
      JSON.stringify(targetSessions.map((s) => s.id)),
      JSON.stringify(uniqueWordIds),
      JSON.stringify(payload),
      JSON.stringify(initialAnswers),
      maxScore
    );

  const saved = db
    .prepare('SELECT * FROM review_tests WHERE id = ?')
    .get(inserted.lastInsertRowid) as ReviewTestRow;

  return rowToReviewTestResponse(db, saved, user.id);
}

export function updateReviewTestAnswer(
  db: Database.Database,
  userId: number,
  testId: number,
  patch: {
    type: 'choice' | 'puzzle';
    question_id?: string;
    option_index?: number;
    puzzle_id?: string;
    solved?: boolean;
  }
): ReviewTestResponse {
  const row = db
    .prepare('SELECT * FROM review_tests WHERE id = ? AND user_id = ?')
    .get(testId, userId) as ReviewTestRow | undefined;

  if (!row) {
    throw new Error('Итоговый тест не найден');
  }
  if (row.is_completed) {
    return rowToReviewTestResponse(db, row, userId);
  }

  const answers = JSON.parse(row.answers_json) as ReviewTestAnswers;

  if (patch.type === 'choice' && patch.question_id && typeof patch.option_index === 'number') {
    answers.choices[patch.question_id] = patch.option_index;
  } else if (patch.type === 'puzzle' && patch.puzzle_id) {
    answers.puzzles_solved[patch.puzzle_id] = Boolean(patch.solved);
  }

  db.prepare('UPDATE review_tests SET answers_json = ? WHERE id = ?').run(
    JSON.stringify(answers),
    row.id
  );

  const updated = db
    .prepare('SELECT * FROM review_tests WHERE id = ?')
    .get(row.id) as ReviewTestRow;

  return rowToReviewTestResponse(db, updated, userId);
}

export function submitReviewTest(
  db: Database.Database,
  userId: number,
  testId: number
): ReviewTestResponse {
  const row = db
    .prepare('SELECT * FROM review_tests WHERE id = ? AND user_id = ?')
    .get(testId, userId) as ReviewTestRow | undefined;

  if (!row) {
    throw new Error('Итоговый тест не найден');
  }
  if (row.is_completed) {
    return rowToReviewTestResponse(db, row, userId);
  }

  const payload = JSON.parse(row.test_payload_json) as ReviewTestPayload;
  const answers = JSON.parse(row.answers_json) as ReviewTestAnswers;

  let score = 0;
  const wordDelta = new Map<number, number>();

  for (const q of payload.questions) {
    const chosen = answers.choices[q.id];
    const isCorrect = chosen === q.correct_index;
    if (isCorrect) {
      score += 1;
      wordDelta.set(q.word_id, (wordDelta.get(q.word_id) ?? 0) + 0.2);
    } else {
      wordDelta.set(q.word_id, (wordDelta.get(q.word_id) ?? 0) - 0.25);
    }
  }

  for (const p of payload.puzzles) {
    if (answers.puzzles_solved[p.id]) {
      score += 1;
    }
  }

  const maxScore = payload.questions.length + payload.puzzles.length;

  const tx = db.transaction(() => {
    const selectProgress = db.prepare(
      'SELECT id, status, ease_factor, times_seen FROM user_progress WHERE user_id = ? AND word_id = ?'
    );
    const updateProgress = db.prepare(
      `UPDATE user_progress
       SET status = ?,
           ease_factor = ?,
           last_reviewed_at = datetime('now')
       WHERE id = ?`
    );

    for (const [wordId, delta] of wordDelta.entries()) {
      const existing = selectProgress.get(userId, wordId) as
        | { id: number; status: WordStatus; ease_factor: number; times_seen: number }
        | undefined;
      if (!existing) continue;
      const nextEase = Math.max(
        1.3,
        Math.min(3.0, Number((existing.ease_factor + delta).toFixed(2)))
      );
      const nextStatus: WordStatus =
        delta < 0 ? 'learning' : nextEase >= 2.65 ? 'mastered' : existing.status;
      updateProgress.run(nextStatus, nextEase, existing.id);
    }

    db.prepare(
      `UPDATE review_tests
       SET score = ?,
           max_score = ?,
           is_completed = 1,
           completed_at = datetime('now')
       WHERE id = ?`
    ).run(score, maxScore, row.id);
  });

  tx();

  const updated = db
    .prepare('SELECT * FROM review_tests WHERE id = ?')
    .get(row.id) as ReviewTestRow;

  return rowToReviewTestResponse(db, updated, userId);
}
