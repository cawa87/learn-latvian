import crypto from 'node:crypto';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type Database from 'better-sqlite3';
import { config } from './config.js';
import { getOrCreateDevUser, getUserById } from './db.js';
import type { UserProfile } from '../shared/types.js';

const SESSION_COOKIE = 'lv_tutor_session';
const OAUTH_STATE_COOKIE = 'lv_tutor_oauth_state';

function signValue(payload: string): string {
  const sig = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySignedValue(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const payload = token.slice(0, idx);
  const providedSig = token.slice(idx + 1);
  const expectedSig = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(payload)
    .digest('base64url');

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  return payload;
}

export function setUserSessionCookie(c: Context, userId: number): void {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, iat: Date.now() }),
    'utf-8'
  ).toString('base64url');
  setCookie(c, SESSION_COOKIE, signValue(payload), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.nodeEnv === 'production' && config.appOrigin.startsWith('https://'),
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearUserSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export function resolveRequestUser(c: Context, db: Database.Database): UserProfile | null {
  const raw = getCookie(c, SESSION_COOKIE);
  const verified = verifySignedValue(raw);
  if (verified) {
    try {
      const parsed = JSON.parse(Buffer.from(verified, 'base64url').toString('utf-8')) as {
        uid?: number;
      };
      if (typeof parsed.uid === 'number') {
        const user = getUserById(db, parsed.uid);
        if (user) return user;
      }
    } catch {
      clearUserSessionCookie(c);
    }
  }

  if (config.devBypassAuth) {
    return getOrCreateDevUser(db);
  }

  return null;
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(config.googleClientId && config.googleClientSecret);
}

export function isAdminUser(user: UserProfile | null): boolean {
  if (!user || !user.email) return false;
  return user.email.trim().toLowerCase() === config.adminEmail;
}

export function buildGoogleAuthRedirect(c: Context): string {
  const state = crypto.randomBytes(24).toString('base64url');
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.nodeEnv === 'production' && config.appOrigin.startsWith('https://'),
    path: '/',
    maxAge: 60 * 10,
  });

  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleCallbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function handleGoogleOAuthCallback(
  c: Context,
  db: Database.Database
): Promise<UserProfile> {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const savedState = getCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/' });

  if (!code || !state || !savedState || state !== savedState) {
    throw new Error('Некорректное состояние авторизации Google');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: config.googleCallbackUrl,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!tokenRes.ok) {
    throw new Error('Не удалось получить токен Google OAuth');
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error('Отсутствует access_token в ответе Google');
  }

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!profileRes.ok) {
    throw new Error('Не удалось загрузить профиль Google');
  }

  const profile = (await profileRes.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  };

  if (!profile.sub || !profile.email) {
    throw new Error('Профиль Google не содержит email');
  }

  const existing = db
    .prepare('SELECT * FROM users WHERE google_id = ? OR email = ?')
    .get(profile.sub, profile.email) as UserProfile | undefined;

  if (existing) {
    db.prepare(
      'UPDATE users SET google_id = ?, name = ?, avatar_url = ? WHERE id = ?'
    ).run(
      profile.sub,
      profile.name || existing.name,
      profile.picture || existing.avatar_url,
      existing.id
    );
    return getUserById(db, existing.id)!;
  }

  const inserted = db
    .prepare(
      `INSERT INTO users (google_id, email, name, avatar_url, daily_goal, context_theme, streak_count)
       VALUES (?, ?, ?, ?, 5, 'riga_everyday', 0)`
    )
    .run(
      profile.sub,
      profile.email,
      profile.name || profile.email.split('@')[0],
      profile.picture || null
    );

  return getUserById(db, Number(inserted.lastInsertRowid))!;
}
