export type ContextTheme =
  | 'riga_everyday'
  | 'work_smalltalk'
  | 'nature_outdoors'
  | 'general';

export type WordStatus = 'new' | 'learning' | 'mastered';

export interface UserProfile {
  id: number;
  google_id: string | null;
  email: string;
  name: string;
  avatar_url: string | null;
  daily_goal: number;
  context_theme: ContextTheme;
  streak_count: number;
  last_completed_date: string | null;
  created_at: string;
}

export interface WordRecord {
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
}

export interface UserProgressRecord {
  id: number;
  user_id: number;
  word_id: number;
  status: WordStatus;
  ease_factor: number;
  times_seen: number;
  times_reused_in_ai: number;
  last_reviewed_at: string | null;
}

export interface TokenAnnotation {
  surface_form: string;
  lemma: string;
  is_new: boolean;
  grammar_note_ru: string;
}

export interface AnnotatedSentence {
  lv: string;
  ru: string;
  speaker?: string;
  annotations: TokenAnnotation[];
}

export interface SessionWordCard {
  word_id: number;
  frequency_rank: number;
  latvian: string;
  russian: string;
  part_of_speech: string;
  grammar_note_ru: string;
  image_query: string;
  image_url: string | null;
  examples: AnnotatedSentence[];
}

export interface DistractorExplanation {
  token: string;
  reason_ru: string;
}

export interface SentencePuzzle {
  id: string;
  russian_prompt: string;
  correct_tokens: string[];
  distractor_tokens: string[];
  distractor_explanations: DistractorExplanation[];
  grammar_summary_ru: string;
}

export interface SessionAiPayload {
  source: 'gemini' | 'fallback';
  context_theme: ContextTheme;
  session_title_ru: string;
  session_intro_ru: string;
  reused_words: Array<{
    word_id: number;
    latvian: string;
    russian: string;
    status: WordStatus;
  }>;
  word_cards: SessionWordCard[];
  synthesis: AnnotatedSentence[];
  puzzles: SentencePuzzle[];
}

export interface WordCheckboxState {
  translation: boolean;
  pronunciation: boolean;
  forms: boolean;
}

export interface SessionCheckboxState {
  words: Record<string, WordCheckboxState>;
  synthesis_read: boolean;
  puzzles_solved: Record<string, boolean>;
}

export interface UserDashboardStats {
  streak_count: number;
  mastered_count: number;
  learning_count: number;
  total_words: number;
  due_review_count: number;
  completed_sessions_count: number;
  sessions_since_last_test: number;
  summary_test_available: boolean;
  can_retake_summary_test: boolean;
  active_review_test_id: number | null;
}

export interface DailySessionResponse {
  id: number;
  session_date: string;
  context_theme: ContextTheme;
  is_completed: boolean;
  is_today: boolean;
  ai_payload: SessionAiPayload;
  checkbox_state: SessionCheckboxState;
  stats: UserDashboardStats;
}

export interface TodaySessionEnvelope {
  prepared: boolean;
  today_date: string;
  session: DailySessionResponse | null;
  stats: UserDashboardStats;
}

export interface SessionHistoryItem {
  id: number;
  session_date: string;
  context_theme: ContextTheme;
  session_title_ru: string;
  source: 'gemini' | 'fallback';
  is_completed: boolean;
  word_count: number;
  words_preview: Array<{
    word_id: number;
    latvian: string;
    russian: string;
  }>;
  completed_steps: number;
  total_steps: number;
  created_at: string;
}

export interface ReviewTestQuestion {
  id: string;
  kind: 'context_meaning' | 'case_choice';
  word_id: number;
  latvian_word: string;
  prompt_lv: string;
  prompt_ru: string;
  options: string[];
  correct_index: number;
  explanation_ru: string;
}

export interface ReviewTestPayload {
  source: 'gemini' | 'fallback';
  title_ru: string;
  intro_ru: string;
  covered_dates: string[];
  covered_words: Array<{
    word_id: number;
    latvian: string;
    russian: string;
  }>;
  questions: ReviewTestQuestion[];
  puzzles: SentencePuzzle[];
}

export interface ReviewTestAnswers {
  choices: Record<string, number>;
  puzzles_solved: Record<string, boolean>;
}

export interface ReviewTestResponse {
  id: number;
  source_session_ids: number[];
  payload: ReviewTestPayload;
  answers: ReviewTestAnswers;
  score: number | null;
  max_score: number;
  is_completed: boolean;
  created_at: string;
  completed_at: string | null;
  stats: UserDashboardStats;
}

export interface ReviewTestHistoryItem {
  id: number;
  title_ru: string;
  covered_dates: string[];
  word_count: number;
  score: number | null;
  max_score: number;
  is_completed: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface DictionaryWordItem extends WordRecord {
  status: WordStatus;
  ease_factor: number;
  times_seen: number;
  times_reused_in_ai: number;
  last_reviewed_at: string | null;
  past_sentences: Array<{
    session_date: string;
    lv: string;
    ru: string;
    annotations: TokenAnnotation[];
  }>;
}

export interface AuthStateResponse {
  authenticated: boolean;
  dev_bypass: boolean;
  google_configured: boolean;
  is_admin: boolean;
  user: UserProfile | null;
  stats: UserDashboardStats | null;
}

export type FeedbackKind = 'proposal' | 'bug';

export type FeedbackStatus = 'new' | 'in_progress' | 'resolved' | 'dismissed';

export interface FeedbackItem {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  user_avatar_url: string | null;
  kind: FeedbackKind;
  title: string;
  message: string;
  page_context: string | null;
  status: FeedbackStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUsageSummary {
  total_requests: number;
  total_prompt_tokens: number;
  total_candidates_tokens: number;
  total_thoughts_tokens: number;
  total_cached_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  last_30_days_tokens: number;
  last_30_days_cost_usd: number;
  total_users: number;
  total_sessions: number;
  open_feedback_count: number;
  total_feedback_count: number;
}

export interface AdminModelBreakdown {
  model: string;
  requests: number;
  prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

export interface AdminOperationBreakdown {
  operation: string;
  requests: number;
  total_tokens: number;
  cost_usd: number;
}

export interface AdminDailyUsage {
  day: string;
  requests: number;
  total_tokens: number;
  cost_usd: number;
}

export interface AdminUsageLogItem {
  id: number;
  user_id: number | null;
  user_email: string | null;
  user_name: string | null;
  operation: string;
  model: string;
  prompt_tokens: number;
  candidates_tokens: number;
  thoughts_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  cost_usd: number;
  created_at: string;
}

export interface AdminOverviewResponse {
  summary: AdminUsageSummary;
  by_model: AdminModelBreakdown[];
  by_operation: AdminOperationBreakdown[];
  by_day: AdminDailyUsage[];
  recent_usage: AdminUsageLogItem[];
  feedback: FeedbackItem[];
}

export const CONTEXT_THEME_META: Record<
  ContextTheme,
  { label: string; shortLabel: string; description: string }
> = {
  riga_everyday: {
    label: 'Повседневная Рига',
    shortLabel: 'Рига',
    description: 'Rimi и Maxima, кофейни Старого города, транспорт Rīgas satiksme, погода и быт',
  },
  work_smalltalk: {
    label: 'Работа и общение',
    shortLabel: 'Работа',
    description: 'Коллеги, встречи, переписка, рабочие задачи и разговоры за кофе',
  },
  nature_outdoors: {
    label: 'Природа и отдых',
    shortLabel: 'Природа',
    description: 'Юрмала, сосновые леса, тропы Сигулды, море, прогулки и выходные',
  },
  general: {
    label: 'На каждый день',
    shortLabel: 'Общая',
    description: 'Обычные жизненные ситуации, друзья, дом и планы на неделю',
  },
};
