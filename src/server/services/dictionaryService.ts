import type Database from 'better-sqlite3';
import type {
  DictionaryWordItem,
  SessionAiPayload,
  TokenAnnotation,
  WordStatus,
} from '../../shared/types.js';

interface DictionaryRow {
  id: number;
  frequency_rank: number;
  latvian: string;
  russian: string;
  part_of_speech: string;
  grammar_note: string;
  fallback_example_lv: string;
  fallback_example_ru: string;
  image_url: string | null;
  image_query: string;
  status: WordStatus | null;
  ease_factor: number | null;
  times_seen: number | null;
  times_reused_in_ai: number | null;
  last_reviewed_at: string | null;
}

export function getUserDictionary(
  db: Database.Database,
  userId: number,
  filters?: { q?: string; status?: 'all' | WordStatus }
): DictionaryWordItem[] {
  const rows = db
    .prepare(
      `SELECT
         w.*,
         up.status,
         up.ease_factor,
         up.times_seen,
         up.times_reused_in_ai,
         up.last_reviewed_at
       FROM words w
       LEFT JOIN user_progress up
         ON up.word_id = w.id AND up.user_id = ?
       ORDER BY w.frequency_rank ASC`
    )
    .all(userId) as DictionaryRow[];

  const sessions = db
    .prepare(
      `SELECT session_date, ai_payload_json
       FROM daily_sessions
       WHERE user_id = ?
       ORDER BY session_date DESC
       LIMIT 45`
    )
    .all(userId) as Array<{ session_date: string; ai_payload_json: string }>;

  const sentencesByLemma = new Map<
    string,
    Array<{
      session_date: string;
      lv: string;
      ru: string;
      annotations: TokenAnnotation[];
    }>
  >();

  const pushSentence = (
    lemma: string,
    entry: { session_date: string; lv: string; ru: string; annotations: TokenAnnotation[] }
  ) => {
    const key = lemma.toLowerCase();
    const list = sentencesByLemma.get(key) || [];
    if (list.length >= 6) return;
    if (list.some((item) => item.lv === entry.lv)) return;
    list.push(entry);
    sentencesByLemma.set(key, list);
  };

  for (const session of sessions) {
    try {
      const payload = JSON.parse(session.ai_payload_json) as SessionAiPayload;
      for (const card of payload.word_cards || []) {
        for (const ex of card.examples || []) {
          const item = {
            session_date: session.session_date,
            lv: ex.lv,
            ru: ex.ru,
            annotations: ex.annotations || [],
          };
          pushSentence(card.latvian, item);
          for (const ann of ex.annotations || []) {
            pushSentence(ann.lemma, item);
          }
        }
      }
      for (const syn of payload.synthesis || []) {
        const item = {
          session_date: session.session_date,
          lv: syn.lv,
          ru: syn.ru,
          annotations: syn.annotations || [],
        };
        for (const ann of syn.annotations || []) {
          pushSentence(ann.lemma, item);
        }
      }
    } catch {
      continue;
    }
  }

  const query = (filters?.q || '').trim().toLowerCase();
  const statusFilter = filters?.status || 'all';

  return rows
    .map((row): DictionaryWordItem => {
      const status: WordStatus = row.status || 'new';
      return {
        id: row.id,
        frequency_rank: row.frequency_rank,
        latvian: row.latvian,
        russian: row.russian,
        part_of_speech: row.part_of_speech,
        grammar_note: row.grammar_note,
        fallback_example_lv: row.fallback_example_lv,
        fallback_example_ru: row.fallback_example_ru,
        image_url: row.image_url,
        image_query: row.image_query,
        status,
        ease_factor: row.ease_factor ?? 2.5,
        times_seen: row.times_seen ?? 0,
        times_reused_in_ai: row.times_reused_in_ai ?? 0,
        last_reviewed_at: row.last_reviewed_at ?? null,
        past_sentences: sentencesByLemma.get(row.latvian.toLowerCase()) || [],
      };
    })
    .filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (!query) return true;
      return (
        item.latvian.toLowerCase().includes(query) ||
        item.russian.toLowerCase().includes(query) ||
        item.part_of_speech.toLowerCase().includes(query)
      );
    });
}

export function setWordProgressStatus(
  db: Database.Database,
  userId: number,
  wordId: number,
  status: WordStatus
): void {
  const existing = db
    .prepare('SELECT id FROM user_progress WHERE user_id = ? AND word_id = ?')
    .get(userId, wordId) as { id: number } | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO user_progress (user_id, word_id, status, ease_factor, times_seen, times_reused_in_ai, last_reviewed_at)
       VALUES (?, ?, ?, 2.5, ?, 0, datetime('now'))`
    ).run(userId, wordId, status, status === 'new' ? 0 : 1);
  } else {
    db.prepare(
      `UPDATE user_progress
       SET status = ?,
           last_reviewed_at = CASE WHEN ? = 'new' THEN last_reviewed_at ELSE datetime('now') END
       WHERE id = ?`
    ).run(status, status, existing.id);
  }
}
