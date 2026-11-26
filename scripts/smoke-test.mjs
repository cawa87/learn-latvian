import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const port = 3099;
const baseUrl = `http://127.0.0.1:${port}`;
const sessionSecret = 'smoke-test-secret-key';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'latvian-smoke-'));

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Smoke test assertion failed: ${message}`);
  }
}

async function waitForHealth(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return await res.json();
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('Server did not become healthy in time');
}

const server = spawn('node', ['dist/server/index.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DATA_DIR: tmpDir,
    DEV_BYPASS_AUTH: 'true',
    SESSION_SECRET: sessionSecret,
    GEMINI_API_KEY: '',
    ADMIN_EMAIL: 'aleksandrzamiatin87@gmail.com',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverStderr = '';
server.stderr.on('data', (chunk) => {
  serverStderr += chunk.toString();
});

try {
  const health = await waitForHealth();
  assert(health.status === 'ok', 'health.status should be ok');
  assert(health.words_count >= 100, `expected >= 100 starter words, got ${health.words_count}`);

  const meRes = await fetch(`${baseUrl}/api/auth/me`);
  assert(meRes.status === 200, 'GET /api/auth/me should return 200');
  const me = await meRes.json();
  assert(me.authenticated === true, 'dev user should be authenticated');
  assert(me.is_admin === false, 'dev user must not be admin');

  const adminForbid = await fetch(`${baseUrl}/api/admin/overview`);
  assert(adminForbid.status === 403, 'non-admin must receive 403 on /api/admin/overview');

  const todayBefore = await fetch(`${baseUrl}/api/session/today`).then((r) => r.json());
  assert(todayBefore.prepared === false, 'today session should start unprepared');

  const preparedRes = await fetch(`${baseUrl}/api/session/prepare`, { method: 'POST' });
  assert(preparedRes.status === 200, 'POST /api/session/prepare should return 200');
  const prepared = await preparedRes.json();
  assert(prepared.ai_payload.word_cards.length === 5, 'expected 5 word cards for default goal');
  assert(prepared.ai_payload.puzzles.length >= 1, 'expected at least 1 sentence puzzle');

  const dictRes = await fetch(`${baseUrl}/api/dictionary`);
  assert(dictRes.status === 200, 'GET /api/dictionary should return 200');
  const dict = await dictRes.json();
  assert(dict.items.length >= 100, 'dictionary should return starter words');

  const fbRes = await fetch(`${baseUrl}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'proposal',
      title: 'Test idea',
      message: 'Smoke test feedback payload',
      page_context: 'today',
    }),
  });
  assert(fbRes.status === 201, 'POST /api/feedback should return 201');
  const fb = await fbRes.json();

  const db = new Database(path.join(tmpDir, 'latvian.db'));
  const adminUser = db
    .prepare('INSERT INTO users (google_id, email, name) VALUES (?, ?, ?) RETURNING id')
    .get('smoke-admin', 'aleksandrzamiatin87@gmail.com', 'Admin Smoke');
  db.close();

  const payload = Buffer.from(
    JSON.stringify({ uid: adminUser.id, iat: Date.now() }),
    'utf-8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', sessionSecret)
    .update(payload)
    .digest('base64url');
  const adminCookie = `lv_tutor_session=${payload}.${sig}`;

  const adminMe = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: adminCookie },
  }).then((r) => r.json());
  assert(adminMe.is_admin === true, 'admin email should have is_admin=true');

  const overviewRes = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Cookie: adminCookie },
  });
  assert(overviewRes.status === 200, 'admin should receive 200 on /api/admin/overview');
  const overview = await overviewRes.json();
  assert(overview.feedback.length === 1, 'admin overview should include submitted feedback');

  const patchFbRes = await fetch(`${baseUrl}/api/admin/feedback/${fb.item.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ status: 'resolved' }),
  });
  assert(patchFbRes.status === 200, 'admin should be able to update feedback status');
  const patchedFb = await patchFbRes.json();
  assert(patchedFb.item.status === 'resolved', 'feedback status should update to resolved');

  console.log('All smoke tests passed.');
} catch (err) {
  if (serverStderr) {
    console.error('Server stderr:', serverStderr);
  }
  console.error(err);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
