import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const dataDir = path.resolve(process.env.DATA_DIR || './data');

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  dataDir,
  dbPath: path.join(dataDir, 'latvian.db'),
  imagesDir: path.join(dataDir, 'images'),
  devBypassAuth: (process.env.DEV_BYPASS_AUTH ?? 'true').toLowerCase() === 'true',
  sessionSecret: process.env.SESSION_SECRET || 'latvian-tutor-local-dev-secret-key',
  geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),
  geminiModel: (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim(),
  googleClientId: (process.env.GOOGLE_CLIENT_ID || '').trim(),
  googleClientSecret: (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
  googleCallbackUrl:
    (process.env.GOOGLE_CALLBACK_URL || '').trim() ||
    `http://localhost:${process.env.PORT || 3000}/api/auth/google/callback`,
  appOrigin: (process.env.APP_ORIGIN || '').trim() || `http://localhost:${process.env.PORT || 3000}`,
  adminEmail: (process.env.ADMIN_EMAIL || 'aleksandrzamiatin87@gmail.com').trim().toLowerCase(),
  unsplashAccessKey: (process.env.UNSPLASH_ACCESS_KEY || '').trim(),
  pexelsApiKey: (process.env.PEXELS_API_KEY || '').trim(),
};
