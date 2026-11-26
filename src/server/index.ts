import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config.js';
import {
  getDb,
  getOrCreateDevUser,
  getUserDashboardStats,
  seedStarterWordsIfEmpty,
  updateUserSettings,
} from './db.js';
import {
  buildGoogleAuthRedirect,
  clearUserSessionCookie,
  handleGoogleOAuthCallback,
  isAdminUser,
  isGoogleOAuthConfigured,
  resolveRequestUser,
  setUserSessionCookie,
} from './auth.js';
import {
  createUserFeedback,
  getAdminOverview,
  updateFeedbackStatus,
} from './services/adminService.js';
import {
  completeSession,
  getSessionById,
  getTodaySessionEnvelope,
  listUserSessions,
  prepareTodaySession,
  resetSessionForRelearn,
  updateSessionCheckboxState,
} from './services/sessionEngine.js';
import {
  getReviewTestById,
  listUserReviewTests,
  prepareSummaryReviewTest,
  submitReviewTest,
  updateReviewTestAnswer,
} from './services/reviewTestEngine.js';
import {
  getUserDictionary,
  setWordProgressStatus,
} from './services/dictionaryService.js';
import type {
  AuthStateResponse,
  ContextTheme,
  FeedbackKind,
  FeedbackStatus,
  WordStatus,
} from '../shared/types.js';

const db = getDb();
const seededCount = seedStarterWordsIfEmpty(db);
if (seededCount > 0) {
  console.log(`Initialized SQLite database with ${seededCount} starter Latvian words.`);
}

const app = new Hono();

app.use(
  '/api/*',
  cors({
    origin: (origin) => origin || config.appOrigin,
    credentials: true,
  })
);

app.get('/api/health', (c) => {
  const row = db.prepare('SELECT COUNT(*) as total FROM words').get() as { total: number };
  return c.json({
    status: 'ok',
    db: 'ok',
    words_count: row.total,
    gemini_configured: Boolean(config.geminiApiKey),
    dev_bypass_auth: config.devBypassAuth,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/auth/me', (c) => {
  const user = resolveRequestUser(c, db);
  const payload: AuthStateResponse = {
    authenticated: Boolean(user),
    dev_bypass: config.devBypassAuth,
    google_configured: isGoogleOAuthConfigured(),
    is_admin: isAdminUser(user),
    user,
    stats: user ? getUserDashboardStats(db, user.id) : null,
  };
  return c.json(payload);
});

app.get('/api/auth/google', (c) => {
  if (!isGoogleOAuthConfigured()) {
    return c.json(
      {
        error:
          'Google OAuth не настроен. Задайте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в .env или включите DEV_BYPASS_AUTH=true.',
      },
      400
    );
  }
  const url = buildGoogleAuthRedirect(c);
  return c.redirect(url);
});

app.get('/api/auth/google/callback', async (c) => {
  try {
    const user = await handleGoogleOAuthCallback(c, db);
    setUserSessionCookie(c, user.id);
    return c.redirect('/');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка входа через Google';
    return c.redirect(`/?auth_error=${encodeURIComponent(message)}`);
  }
});

app.post('/api/auth/dev-login', (c) => {
  if (!config.devBypassAuth) {
    return c.json({ error: 'Локальный режим входа отключён' }, 403);
  }
  const user = getOrCreateDevUser(db);
  setUserSessionCookie(c, user.id);
  return c.json({
    authenticated: true,
    user,
    stats: getUserDashboardStats(db, user.id),
  });
});

app.post('/api/auth/logout', (c) => {
  clearUserSessionCookie(c);
  return c.json({ ok: true });
});

app.patch('/api/user/settings', async (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  const body = (await c.req.json()) as {
    daily_goal?: number;
    context_theme?: ContextTheme;
  };
  const updated = updateUserSettings(db, user.id, body);
  return c.json({
    user: updated,
    stats: getUserDashboardStats(db, updated.id),
  });
});

app.get('/api/session/today', (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  return c.json(getTodaySessionEnvelope(db, user));
});

app.post('/api/session/prepare', async (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  try {
    const session = await prepareTodaySession(db, user, { forceRegenerate: false });
    return c.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось подготовить урок';
    return c.json({ error: message }, 500);
  }
});

app.post('/api/session/regenerate', async (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  try {
    const session = await prepareTodaySession(db, user, { forceRegenerate: true });
    return c.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось перегенерировать урок';
    return c.json({ error: message }, 500);
  }
});

app.patch('/api/session/checkbox', async (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  try {
    const body = (await c.req.json()) as {
      session_id?: number;
      type: 'word' | 'synthesis' | 'puzzle';
      word_id?: number;
      field?: 'translation' | 'pronunciation' | 'forms';
      puzzle_id?: string;
      value: boolean;
    };
    const updated = updateSessionCheckboxState(db, user.id, body);
    return c.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось сохранить отметку';
    return c.json({ error: message }, 400);
  }
});

app.post('/api/session/complete', async (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  try {
    let sessionId: number | undefined;
    try {
      const body = (await c.req.json()) as { session_id?: number };
      if (typeof body?.session_id === 'number') {
        sessionId = body.session_id;
      }
    } catch {
      sessionId = undefined;
    }
    const completed = completeSession(db, user, sessionId);
    return c.json(completed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось завершить урок';
    return c.json({ error: message }, 400);
  }
});

app.get('/api/sessions/history', (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  return c.json({
    sessions: listUserSessions(db, user.id),
    review_tests: listUserReviewTests(db, user.id),
    stats: getUserDashboardStats(db, user.id),
  });
});

app.get('/api/sessions/:id', (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  const sessionId = Number(c.req.param('id'));
  if (!sessionId) {
    return c.json({ error: 'Некорректный идентификатор урока' }, 400);
  }
  const session = getSessionById(db, user.id, sessionId);
  if (!session) {
    return c.json({ error: 'Урок не найден' }, 404);
  }
  return c.json(session);
});

app.post('/api/sessions/:id/relearn', (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  const sessionId = Number(c.req.param('id'));
  if (!sessionId) {
    return c.json({ error: 'Некорректный идентификатор урока' }, 400);
  }
  try {
    const reset = resetSessionForRelearn(db, user.id, sessionId);
    return c.json(reset);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось сбросить прогресс урока';
    return c.json({ error: message }, 400);
  }
});

app.post('/api/review-tests/prepare', async (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  try {
    let forceNew = false;
    try {
      const body = (await c.req.json()) as { force_new?: boolean };
      forceNew = Boolean(body?.force_new);
    } catch {
      forceNew = false;
    }
    const test = await prepareSummaryReviewTest(db, user, { forceNew });
    return c.json(test);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось подготовить итоговый тест';
    return c.json({ error: message }, 400);
  }
});

app.get('/api/review-tests/:id', (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  const testId = Number(c.req.param('id'));
  if (!testId) {
    return c.json({ error: 'Некорректный идентификатор теста' }, 400);
  }
  const test = getReviewTestById(db, user.id, testId);
  if (!test) {
    return c.json({ error: 'Итоговый тест не найден' }, 404);
  }
  return c.json(test);
});

app.patch('/api/review-tests/:id/answer', async (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  const testId = Number(c.req.param('id'));
  if (!testId) {
    return c.json({ error: 'Некорректный идентификатор теста' }, 400);
  }
  try {
    const body = (await c.req.json()) as {
      type: 'choice' | 'puzzle';
      question_id?: string;
      option_index?: number;
      puzzle_id?: string;
      solved?: boolean;
    };
    const updated = updateReviewTestAnswer(db, user.id, testId, body);
    return c.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось сохранить ответ';
    return c.json({ error: message }, 400);
  }
});

app.post('/api/review-tests/:id/submit', (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  const testId = Number(c.req.param('id'));
  if (!testId) {
    return c.json({ error: 'Некорректный идентификатор теста' }, 400);
  }
  try {
    const graded = submitReviewTest(db, user.id, testId);
    return c.json(graded);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось завершить тест';
    return c.json({ error: message }, 400);
  }
});

app.get('/api/dictionary', (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  const q = c.req.query('q') || '';
  const statusParam = (c.req.query('status') || 'all') as 'all' | WordStatus;
  const items = getUserDictionary(db, user.id, { q, status: statusParam });
  return c.json({
    items,
    stats: getUserDashboardStats(db, user.id),
  });
});

app.patch('/api/dictionary/:wordId/status', async (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  const wordId = Number(c.req.param('wordId'));
  const body = (await c.req.json()) as { status?: WordStatus };
  if (!wordId || !body.status || !['new', 'learning', 'mastered'].includes(body.status)) {
    return c.json({ error: 'Неверные параметры статуса слова' }, 400);
  }
  setWordProgressStatus(db, user.id, wordId, body.status);
  return c.json({
    ok: true,
    stats: getUserDashboardStats(db, user.id),
  });
});

app.post('/api/feedback', async (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  try {
    const body = (await c.req.json()) as {
      kind?: FeedbackKind;
      title?: string;
      message?: string;
      page_context?: string;
    };
    const item = createUserFeedback(db, user.id, {
      kind: body.kind === 'bug' ? 'bug' : 'proposal',
      title: body.title || '',
      message: body.message || '',
      page_context: body.page_context || null,
    });
    return c.json({ ok: true, item }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось отправить сообщение';
    return c.json({ error: message }, 400);
  }
});

app.get('/api/admin/overview', (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  if (!isAdminUser(user)) {
    return c.json({ error: 'Доступ разрешён только администратору' }, 403);
  }
  return c.json(getAdminOverview(db));
});

app.patch('/api/admin/feedback/:id', async (c) => {
  const user = resolveRequestUser(c, db);
  if (!user) {
    return c.json({ error: 'Требуется авторизация' }, 401);
  }
  if (!isAdminUser(user)) {
    return c.json({ error: 'Доступ разрешён только администратору' }, 403);
  }
  const feedbackId = Number(c.req.param('id'));
  if (!feedbackId) {
    return c.json({ error: 'Некорректный идентификатор обращения' }, 400);
  }
  try {
    const body = (await c.req.json()) as {
      status?: FeedbackStatus;
      admin_note?: string | null;
    };
    const item = updateFeedbackStatus(db, feedbackId, body);
    return c.json({ ok: true, item });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось обновить статус';
    return c.json({ error: message }, 400);
  }
});

app.get('/api/images/:filename', (c) => {
  const fileName = path.basename(c.req.param('filename'));
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
    return c.notFound();
  }
  const fullPath = path.join(config.imagesDir, fileName);
  if (!fs.existsSync(fullPath)) {
    return c.notFound();
  }
  const data = fs.readFileSync(fullPath);
  const ext = path.extname(fileName).toLowerCase();
  const contentType =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return new Response(data, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

const clientDistDir = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDistDir)) {
  app.use('/assets/*', serveStatic({ root: './dist/client' }));
  app.use('/favicon.ico', serveStatic({ root: './dist/client' }));
  app.get('*', (c) => {
    const indexPath = path.join(clientDistDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      return c.html(fs.readFileSync(indexPath, 'utf-8'));
    }
    return c.notFound();
  });
}

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`Latvian Tutor server listening on http://localhost:${info.port}`);
  }
);
