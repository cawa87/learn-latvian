import type Database from 'better-sqlite3';
import type {
  AdminDailyUsage,
  AdminModelBreakdown,
  AdminOperationBreakdown,
  AdminOverviewResponse,
  AdminUsageLogItem,
  FeedbackItem,
  FeedbackKind,
  FeedbackStatus,
} from '../../shared/types.js';

export interface GeminiUsageMetadataLike {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
}

interface ModelPricePerMillion {
  input: number;
  cachedInput: number;
  output: number;
}

const MODEL_PRICING: Array<{ match: string; rates: ModelPricePerMillion }> = [
  { match: 'gemini-2.5-flash-lite', rates: { input: 0.1, cachedInput: 0.01, output: 0.4 } },
  { match: 'gemini-2.5-flash', rates: { input: 0.3, cachedInput: 0.03, output: 2.5 } },
  { match: 'gemini-2.5-pro', rates: { input: 1.25, cachedInput: 0.125, output: 10.0 } },
  { match: 'gemini-2.0-flash-lite', rates: { input: 0.075, cachedInput: 0.01875, output: 0.3 } },
  { match: 'gemini-2.0-flash', rates: { input: 0.1, cachedInput: 0.025, output: 0.4 } },
  { match: 'gemini-1.5-pro', rates: { input: 1.25, cachedInput: 0.3125, output: 5.0 } },
  { match: 'gemini-1.5-flash', rates: { input: 0.075, cachedInput: 0.01875, output: 0.3 } },
];

const DEFAULT_RATES: ModelPricePerMillion = {
  input: 0.3,
  cachedInput: 0.03,
  output: 2.5,
};

export function resolveModelPricing(model: string): ModelPricePerMillion {
  const normalized = model.trim().toLowerCase();
  for (const entry of MODEL_PRICING) {
    if (normalized.includes(entry.match)) {
      return entry.rates;
    }
  }
  return DEFAULT_RATES;
}

export function calculateGeminiCostUsd(
  model: string,
  tokens: {
    promptTokens: number;
    candidatesTokens: number;
    thoughtsTokens: number;
    cachedTokens: number;
  }
): number {
  const rates = resolveModelPricing(model);
  const uncachedPrompt = Math.max(0, tokens.promptTokens - tokens.cachedTokens);
  const billableOutput = Math.max(0, tokens.candidatesTokens + tokens.thoughtsTokens);
  const cost =
    (uncachedPrompt / 1_000_000) * rates.input +
    (Math.max(0, tokens.cachedTokens) / 1_000_000) * rates.cachedInput +
    (billableOutput / 1_000_000) * rates.output;
  return Number(cost.toFixed(8));
}

export function recordGeminiUsage(
  db: Database.Database,
  params: {
    userId: number | null;
    operation: string;
    model: string;
    usageMetadata?: GeminiUsageMetadataLike | null;
  }
): void {
  const meta = params.usageMetadata;
  if (!meta) return;

  const promptTokens = Math.max(0, Math.round(meta.promptTokenCount ?? 0));
  const candidatesTokens = Math.max(0, Math.round(meta.candidatesTokenCount ?? 0));
  const thoughtsTokens = Math.max(0, Math.round(meta.thoughtsTokenCount ?? 0));
  const cachedTokens = Math.max(0, Math.round(meta.cachedContentTokenCount ?? 0));
  const totalTokens = Math.max(
    0,
    Math.round(meta.totalTokenCount ?? promptTokens + candidatesTokens + thoughtsTokens)
  );

  if (totalTokens === 0 && promptTokens === 0 && candidatesTokens === 0) {
    return;
  }

  const costUsd = calculateGeminiCostUsd(params.model, {
    promptTokens,
    candidatesTokens,
    thoughtsTokens,
    cachedTokens,
  });

  db.prepare(
    `INSERT INTO llm_usage_logs (
       user_id,
       operation,
       model,
       prompt_tokens,
       candidates_tokens,
       thoughts_tokens,
       cached_tokens,
       total_tokens,
       cost_usd
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.userId,
    params.operation,
    params.model,
    promptTokens,
    candidatesTokens,
    thoughtsTokens,
    cachedTokens,
    totalTokens,
    costUsd
  );
}

export function createUserFeedback(
  db: Database.Database,
  userId: number,
  input: {
    kind: FeedbackKind;
    title: string;
    message: string;
    page_context?: string | null;
  }
): FeedbackItem {
  const kind: FeedbackKind = input.kind === 'bug' ? 'bug' : 'proposal';
  const title = input.title.trim().slice(0, 140);
  const message = input.message.trim().slice(0, 3000);
  const pageContext = input.page_context ? input.page_context.trim().slice(0, 80) : null;

  if (!message) {
    throw new Error('Опишите ваше предложение или найденную ошибку');
  }

  const finalTitle =
    title || (kind === 'bug' ? 'Сообщение об ошибке' : 'Предложение по улучшению');

  const inserted = db
    .prepare(
      `INSERT INTO user_feedback (user_id, kind, title, message, page_context, status)
       VALUES (?, ?, ?, ?, ?, 'new')`
    )
    .run(userId, kind, finalTitle, message, pageContext);

  const row = getFeedbackById(db, Number(inserted.lastInsertRowid));
  if (!row) {
    throw new Error('Не удалось сохранить обращение');
  }
  return row;
}

function getFeedbackById(db: Database.Database, feedbackId: number): FeedbackItem | null {
  const row = db
    .prepare(
      `SELECT
         f.id,
         f.user_id,
         u.name AS user_name,
         u.email AS user_email,
         u.avatar_url AS user_avatar_url,
         f.kind,
         f.title,
         f.message,
         f.page_context,
         f.status,
         f.admin_note,
         f.created_at,
         f.updated_at
       FROM user_feedback f
       JOIN users u ON u.id = f.user_id
       WHERE f.id = ?`
    )
    .get(feedbackId) as FeedbackItem | undefined;
  return row ?? null;
}

export function listUserFeedbackForAdmin(db: Database.Database): FeedbackItem[] {
  return db
    .prepare(
      `SELECT
         f.id,
         f.user_id,
         u.name AS user_name,
         u.email AS user_email,
         u.avatar_url AS user_avatar_url,
         f.kind,
         f.title,
         f.message,
         f.page_context,
         f.status,
         f.admin_note,
         f.created_at,
         f.updated_at
       FROM user_feedback f
       JOIN users u ON u.id = f.user_id
       ORDER BY f.created_at DESC, f.id DESC`
    )
    .all() as FeedbackItem[];
}

export function updateFeedbackStatus(
  db: Database.Database,
  feedbackId: number,
  updates: { status?: FeedbackStatus; admin_note?: string | null }
): FeedbackItem {
  const existing = getFeedbackById(db, feedbackId);
  if (!existing) {
    throw new Error('Обращение не найдено');
  }

  const allowed: FeedbackStatus[] = ['new', 'in_progress', 'resolved', 'dismissed'];
  const nextStatus =
    updates.status && allowed.includes(updates.status) ? updates.status : existing.status;
  const nextNote =
    updates.admin_note !== undefined
      ? updates.admin_note === null
        ? null
        : updates.admin_note.trim().slice(0, 1000) || null
      : existing.admin_note;

  db.prepare(
    `UPDATE user_feedback
     SET status = ?,
         admin_note = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, nextNote, feedbackId);

  return getFeedbackById(db, feedbackId)!;
}

export function getAdminOverview(db: Database.Database): AdminOverviewResponse {
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total_requests,
         COALESCE(SUM(prompt_tokens), 0) AS total_prompt_tokens,
         COALESCE(SUM(candidates_tokens), 0) AS total_candidates_tokens,
         COALESCE(SUM(thoughts_tokens), 0) AS total_thoughts_tokens,
         COALESCE(SUM(cached_tokens), 0) AS total_cached_tokens,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(SUM(cost_usd), 0) AS total_cost_usd
       FROM llm_usage_logs`
    )
    .get() as {
    total_requests: number;
    total_prompt_tokens: number;
    total_candidates_tokens: number;
    total_thoughts_tokens: number;
    total_cached_tokens: number;
    total_tokens: number;
    total_cost_usd: number;
  };

  const last30 = db
    .prepare(
      `SELECT
         COALESCE(SUM(total_tokens), 0) AS last_30_days_tokens,
         COALESCE(SUM(cost_usd), 0) AS last_30_days_cost_usd
       FROM llm_usage_logs
       WHERE created_at >= datetime('now', '-30 days')`
    )
    .get() as {
    last_30_days_tokens: number;
    last_30_days_cost_usd: number;
  };

  const userCount = db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number };
  const sessionCount = db.prepare('SELECT COUNT(*) AS cnt FROM daily_sessions').get() as {
    cnt: number;
  };
  const feedbackCounts = db
    .prepare(
      `SELECT
         COUNT(*) AS total_feedback_count,
         COALESCE(SUM(CASE WHEN status IN ('new', 'in_progress') THEN 1 ELSE 0 END), 0) AS open_feedback_count
       FROM user_feedback`
    )
    .get() as {
    total_feedback_count: number;
    open_feedback_count: number;
  };

  const byModel = db
    .prepare(
      `SELECT
         model,
         COUNT(*) AS requests,
         COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
         COALESCE(SUM(candidates_tokens + thoughts_tokens), 0) AS output_tokens,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(SUM(cost_usd), 0) AS cost_usd
       FROM llm_usage_logs
       GROUP BY model
       ORDER BY cost_usd DESC, total_tokens DESC`
    )
    .all() as AdminModelBreakdown[];

  const byOperation = db
    .prepare(
      `SELECT
         operation,
         COUNT(*) AS requests,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(SUM(cost_usd), 0) AS cost_usd
       FROM llm_usage_logs
       GROUP BY operation
       ORDER BY cost_usd DESC, total_tokens DESC`
    )
    .all() as AdminOperationBreakdown[];

  const byDay = db
    .prepare(
      `SELECT
         substr(created_at, 1, 10) AS day,
         COUNT(*) AS requests,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(SUM(cost_usd), 0) AS cost_usd
       FROM llm_usage_logs
       WHERE created_at >= datetime('now', '-14 days')
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day ASC`
    )
    .all() as AdminDailyUsage[];

  const recentUsage = db
    .prepare(
      `SELECT
         l.id,
         l.user_id,
         u.email AS user_email,
         u.name AS user_name,
         l.operation,
         l.model,
         l.prompt_tokens,
         l.candidates_tokens,
         l.thoughts_tokens,
         l.cached_tokens,
         l.total_tokens,
         l.cost_usd,
         l.created_at
       FROM llm_usage_logs l
       LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 30`
    )
    .all() as AdminUsageLogItem[];

  const feedback = listUserFeedbackForAdmin(db);

  return {
    summary: {
      total_requests: totals.total_requests,
      total_prompt_tokens: totals.total_prompt_tokens,
      total_candidates_tokens: totals.total_candidates_tokens,
      total_thoughts_tokens: totals.total_thoughts_tokens,
      total_cached_tokens: totals.total_cached_tokens,
      total_tokens: totals.total_tokens,
      total_cost_usd: Number(totals.total_cost_usd.toFixed(6)),
      last_30_days_tokens: last30.last_30_days_tokens,
      last_30_days_cost_usd: Number(last30.last_30_days_cost_usd.toFixed(6)),
      total_users: userCount.cnt,
      total_sessions: sessionCount.cnt,
      open_feedback_count: feedbackCounts.open_feedback_count,
      total_feedback_count: feedbackCounts.total_feedback_count,
    },
    by_model: byModel.map((m) => ({ ...m, cost_usd: Number(m.cost_usd.toFixed(6)) })),
    by_operation: byOperation.map((o) => ({ ...o, cost_usd: Number(o.cost_usd.toFixed(6)) })),
    by_day: byDay.map((d) => ({ ...d, cost_usd: Number(d.cost_usd.toFixed(6)) })),
    recent_usage: recentUsage.map((r) => ({ ...r, cost_usd: Number(r.cost_usd.toFixed(6)) })),
    feedback,
  };
}
