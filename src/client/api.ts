import type {
  AdminOverviewResponse,
  AuthStateResponse,
  ContextTheme,
  DailySessionResponse,
  DictionaryWordItem,
  FeedbackItem,
  FeedbackKind,
  FeedbackStatus,
  ReviewTestHistoryItem,
  ReviewTestResponse,
  SessionHistoryItem,
  TodaySessionEnvelope,
  UserDashboardStats,
  UserProfile,
  WordStatus,
} from '../shared/types';

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `Ошибка запроса (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      message = `Ошибка сервера (${response.status})`;
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const api = {
  getAuthState: () => apiFetch<AuthStateResponse>('/api/auth/me'),
  devLogin: () =>
    apiFetch<{ authenticated: boolean; user: UserProfile; stats: UserDashboardStats }>(
      '/api/auth/dev-login',
      { method: 'POST' }
    ),
  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  updateSettings: (payload: { daily_goal?: number; context_theme?: ContextTheme }) =>
    apiFetch<{ user: UserProfile; stats: UserDashboardStats }>('/api/user/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getTodaySession: () => apiFetch<TodaySessionEnvelope>('/api/session/today'),
  prepareTodaySession: () =>
    apiFetch<DailySessionResponse>('/api/session/prepare', { method: 'POST' }),
  regenerateSession: () =>
    apiFetch<DailySessionResponse>('/api/session/regenerate', { method: 'POST' }),
  updateCheckbox: (payload: {
    session_id?: number;
    type: 'word' | 'synthesis' | 'puzzle';
    word_id?: number;
    field?: 'translation' | 'pronunciation' | 'forms';
    puzzle_id?: string;
    value: boolean;
  }) =>
    apiFetch<DailySessionResponse>('/api/session/checkbox', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  completeSession: (sessionId?: number) =>
    apiFetch<DailySessionResponse>('/api/session/complete', {
      method: 'POST',
      body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
    }),
  getSessionHistory: () =>
    apiFetch<{
      sessions: SessionHistoryItem[];
      review_tests: ReviewTestHistoryItem[];
      stats: UserDashboardStats;
    }>('/api/sessions/history'),
  getSessionById: (sessionId: number) =>
    apiFetch<DailySessionResponse>(`/api/sessions/${sessionId}`),
  relearnSession: (sessionId: number) =>
    apiFetch<DailySessionResponse>(`/api/sessions/${sessionId}/relearn`, {
      method: 'POST',
    }),
  prepareSummaryTest: (forceNew = false) =>
    apiFetch<ReviewTestResponse>('/api/review-tests/prepare', {
      method: 'POST',
      body: JSON.stringify({ force_new: forceNew }),
    }),
  getReviewTest: (testId: number) =>
    apiFetch<ReviewTestResponse>(`/api/review-tests/${testId}`),
  updateReviewTestAnswer: (
    testId: number,
    payload: {
      type: 'choice' | 'puzzle';
      question_id?: string;
      option_index?: number;
      puzzle_id?: string;
      solved?: boolean;
    }
  ) =>
    apiFetch<ReviewTestResponse>(`/api/review-tests/${testId}/answer`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  submitReviewTest: (testId: number) =>
    apiFetch<ReviewTestResponse>(`/api/review-tests/${testId}/submit`, {
      method: 'POST',
    }),
  getDictionary: (q: string, status: 'all' | WordStatus) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status !== 'all') params.set('status', status);
    const qs = params.toString();
    return apiFetch<{ items: DictionaryWordItem[]; stats: UserDashboardStats }>(
      `/api/dictionary${qs ? `?${qs}` : ''}`
    );
  },
  updateWordStatus: (wordId: number, status: WordStatus) =>
    apiFetch<{ ok: boolean; stats: UserDashboardStats }>(
      `/api/dictionary/${wordId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    ),
  submitFeedback: (payload: {
    kind: FeedbackKind;
    title: string;
    message: string;
    page_context?: string;
  }) =>
    apiFetch<{ ok: boolean; item: FeedbackItem }>('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAdminOverview: () => apiFetch<AdminOverviewResponse>('/api/admin/overview'),
  updateAdminFeedback: (
    feedbackId: number,
    payload: { status?: FeedbackStatus; admin_note?: string | null }
  ) =>
    apiFetch<{ ok: boolean; item: FeedbackItem }>(`/api/admin/feedback/${feedbackId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};
