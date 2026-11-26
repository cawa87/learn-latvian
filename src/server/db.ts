import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from './config.js';
import type {
  ContextTheme,
  UserDashboardStats,
  UserProfile,
  WordRecord,
} from '../shared/types.js';

export interface StarterWordSeed {
  frequency_rank: number;
  latvian: string;
  russian: string;
  part_of_speech: string;
  grammar_note: string;
  fallback_example_lv: string;
  fallback_example_ru: string;
  image_query: string;
  image_url?: string | null;
}

let dbInstance: Database.Database | null = null;

export function ensureDataDirectories(): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.imagesDir, { recursive: true });
}

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }
  ensureDataDirectories();
  const db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  initSchema(db);
  dbInstance = db;
  return db;
}

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      avatar_url TEXT,
      daily_goal INTEGER NOT NULL DEFAULT 5 CHECK (daily_goal >= 3 AND daily_goal <= 10),
      context_theme TEXT NOT NULL DEFAULT 'riga_everyday',
      streak_count INTEGER NOT NULL DEFAULT 0,
      last_completed_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      frequency_rank INTEGER NOT NULL,
      latvian TEXT NOT NULL UNIQUE,
      russian TEXT NOT NULL,
      part_of_speech TEXT NOT NULL,
      grammar_note TEXT NOT NULL,
      fallback_example_lv TEXT NOT NULL,
      fallback_example_ru TEXT NOT NULL,
      image_url TEXT,
      image_query TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_words_frequency_rank ON words(frequency_rank);

    CREATE TABLE IF NOT EXISTS user_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      word_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'learning', 'mastered')),
      ease_factor REAL NOT NULL DEFAULT 2.5,
      times_seen INTEGER NOT NULL DEFAULT 0,
      times_reused_in_ai INTEGER NOT NULL DEFAULT 0,
      last_reviewed_at TEXT,
      UNIQUE(user_id, word_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_progress_lookup
      ON user_progress(user_id, status, ease_factor, last_reviewed_at);

    CREATE TABLE IF NOT EXISTS daily_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_date TEXT NOT NULL,
      context_theme TEXT NOT NULL,
      word_ids_json TEXT NOT NULL,
      ai_payload_json TEXT NOT NULL,
      checkbox_state_json TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, session_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_daily_sessions_user_date
      ON daily_sessions(user_id, session_date);

    CREATE TABLE IF NOT EXISTS review_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source_session_ids_json TEXT NOT NULL,
      word_ids_json TEXT NOT NULL,
      test_payload_json TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      score INTEGER,
      max_score INTEGER NOT NULL DEFAULT 0,
      is_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_review_tests_user
      ON review_tests(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS llm_usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      operation TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      candidates_tokens INTEGER NOT NULL DEFAULT 0,
      thoughts_tokens INTEGER NOT NULL DEFAULT 0,
      cached_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_llm_usage_created
      ON llm_usage_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS user_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('proposal', 'bug')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      page_context TEXT,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'dismissed')),
      admin_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_feedback_created
      ON user_feedback(created_at DESC);
  `);
}

function resolveStarterWordsPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const candidates = [
    path.resolve(process.cwd(), 'scripts/data/starter_words.json'),
    path.resolve(path.dirname(currentFile), '../../scripts/data/starter_words.json'),
    path.resolve(path.dirname(currentFile), '../../../scripts/data/starter_words.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('starter_words.json not found');
}

export function upsertWords(db: Database.Database, entries: StarterWordSeed[]): number {
  const stmt = db.prepare(`
    INSERT INTO words (
      frequency_rank,
      latvian,
      russian,
      part_of_speech,
      grammar_note,
      fallback_example_lv,
      fallback_example_ru,
      image_url,
      image_query
    )
    VALUES (
      @frequency_rank,
      @latvian,
      @russian,
      @part_of_speech,
      @grammar_note,
      @fallback_example_lv,
      @fallback_example_ru,
      @image_url,
      @image_query
    )
    ON CONFLICT(latvian) DO UPDATE SET
      frequency_rank = excluded.frequency_rank,
      russian = excluded.russian,
      part_of_speech = excluded.part_of_speech,
      grammar_note = excluded.grammar_note,
      fallback_example_lv = excluded.fallback_example_lv,
      fallback_example_ru = excluded.fallback_example_ru,
      image_query = excluded.image_query,
      image_url = COALESCE(words.image_url, excluded.image_url)
  `);

  const runBatch = db.transaction((items: StarterWordSeed[]) => {
    let count = 0;
    for (const item of items) {
      stmt.run({
        frequency_rank: item.frequency_rank,
        latvian: item.latvian.trim(),
        russian: item.russian.trim(),
        part_of_speech: item.part_of_speech.trim(),
        grammar_note: item.grammar_note.trim(),
        fallback_example_lv: item.fallback_example_lv.trim(),
        fallback_example_ru: item.fallback_example_ru.trim(),
        image_url: item.image_url ?? null,
        image_query: item.image_query.trim(),
      });
      count += 1;
    }
    return count;
  });

  return runBatch(entries);
}

export function seedStarterWordsIfEmpty(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as total FROM words').get() as { total: number };
  if (row.total > 0) {
    return 0;
  }
  const raw = fs.readFileSync(resolveStarterWordsPath(), 'utf-8');
  const words = JSON.parse(raw) as StarterWordSeed[];
  return upsertWords(db, words);
}

export function getOrCreateDevUser(db: Database.Database): UserProfile {
  const existing = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get('local@latvian-tutor.app') as UserProfile | undefined;

  if (existing) {
    return existing;
  }

  const info = db
    .prepare(
      `INSERT INTO users (google_id, email, name, avatar_url, daily_goal, context_theme, streak_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'dev-local-user',
      'local@latvian-tutor.app',
      'Ученик в Риге',
      null,
      5,
      'riga_everyday',
      0
    );

  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) as UserProfile;
}

export function getUserById(db: Database.Database, userId: number): UserProfile | null {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
    | UserProfile
    | undefined;
  return user ?? null;
}

export function getUserDashboardStats(
  db: Database.Database,
  userId: number
): UserDashboardStats {
  const user = db
    .prepare('SELECT streak_count FROM users WHERE id = ?')
    .get(userId) as { streak_count: number } | undefined;

  const totalRow = db.prepare('SELECT COUNT(*) as total FROM words').get() as {
    total: number;
  };

  const progressRows = db
    .prepare(
      `SELECT status, COUNT(*) as cnt
       FROM user_progress
       WHERE user_id = ?
       GROUP BY status`
    )
    .all(userId) as Array<{ status: string; cnt: number }>;

  let masteredCount = 0;
  let learningCount = 0;
  for (const r of progressRows) {
    if (r.status === 'mastered') masteredCount = r.cnt;
    if (r.status === 'learning') learningCount = r.cnt;
  }

  const dueRow = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM user_progress
       WHERE user_id = ?
         AND status IN ('learning', 'mastered')
         AND (
           last_reviewed_at IS NULL
           OR julianday('now') - julianday(last_reviewed_at) >= CASE
             WHEN status = 'learning' THEN 1
             WHEN ease_factor < 2.2 THEN 3
             WHEN ease_factor < 2.6 THEN 7
             ELSE 14
           END
         )`
    )
    .get(userId) as { cnt: number };

  const completedSessions = db
    .prepare(
      `SELECT id
       FROM daily_sessions
       WHERE user_id = ? AND is_completed = 1
       ORDER BY session_date DESC`
    )
    .all(userId) as Array<{ id: number }>;

  const completedTests = db
    .prepare(
      `SELECT source_session_ids_json
       FROM review_tests
       WHERE user_id = ? AND is_completed = 1`
    )
    .all(userId) as Array<{ source_session_ids_json: string }>;

  const testedSessionIds = new Set<number>();
  for (const t of completedTests) {
    try {
      const ids = JSON.parse(t.source_session_ids_json) as number[];
      for (const id of ids) testedSessionIds.add(id);
    } catch {
      continue;
    }
  }

  const untestedCount = completedSessions.filter((s) => !testedSessionIds.has(s.id)).length;

  const activeTest = db
    .prepare(
      `SELECT id
       FROM review_tests
       WHERE user_id = ? AND is_completed = 0
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(userId) as { id: number } | undefined;

  return {
    streak_count: user?.streak_count ?? 0,
    mastered_count: masteredCount,
    learning_count: learningCount,
    total_words: totalRow.total,
    due_review_count: dueRow.cnt,
    completed_sessions_count: completedSessions.length,
    sessions_since_last_test: untestedCount,
    summary_test_available: untestedCount >= 5,
    can_retake_summary_test: completedSessions.length >= 5,
    active_review_test_id: activeTest?.id ?? null,
  };
}

export function updateUserSettings(
  db: Database.Database,
  userId: number,
  updates: { daily_goal?: number; context_theme?: ContextTheme }
): UserProfile {
  const current = getUserById(db, userId);
  if (!current) {
    throw new Error('User not found');
  }

  const nextGoal =
    updates.daily_goal !== undefined
      ? Math.max(3, Math.min(10, Math.round(updates.daily_goal)))
      : current.daily_goal;

  const allowedThemes: ContextTheme[] = [
    'riga_everyday',
    'work_smalltalk',
    'nature_outdoors',
    'general',
  ];
  const nextTheme =
    updates.context_theme && allowedThemes.includes(updates.context_theme)
      ? updates.context_theme
      : current.context_theme;

  db.prepare('UPDATE users SET daily_goal = ?, context_theme = ? WHERE id = ?').run(
    nextGoal,
    nextTheme,
    userId
  );

  return getUserById(db, userId)!;
}

export function getWordsByIds(db: Database.Database, ids: number[]): WordRecord[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT * FROM words WHERE id IN (${placeholders})`)
    .all(...ids) as WordRecord[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is WordRecord => Boolean(r));
}
