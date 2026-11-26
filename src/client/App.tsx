import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  History,
  Layers,
  LayoutGrid,
  LogOut,
  MessageSquarePlus,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import type {
  AuthStateResponse,
  ContextTheme,
  DailySessionResponse,
  ReviewTestResponse,
  UserDashboardStats,
} from '../shared/types';
import { api } from './api';
import { AdminDashboardView } from './components/AdminDashboardView';
import { BentoDashboard } from './components/BentoDashboard';
import { DictionaryView } from './components/DictionaryView';
import { FeedbackModal } from './components/FeedbackModal';
import { LoginView } from './components/LoginView';
import { PrepareSessionHero } from './components/PrepareSessionHero';
import { SentencePuzzleBuilder } from './components/SentencePuzzleBuilder';
import { SessionHistoryView } from './components/SessionHistoryView';
import { SummaryTestView } from './components/SummaryTestView';
import { SynthesisSection } from './components/SynthesisSection';
import { WordCard } from './components/WordCard';

type ActiveTab = 'today' | 'history' | 'dictionary' | 'admin';
type StageMode = 'focus' | 'grid';

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem('lv_tutor_theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [auth, setAuth] = useState<AuthStateResponse | null>(null);
  const [todayDate, setTodayDate] = useState<string>('');
  const [todayPrepared, setTodayPrepared] = useState<boolean>(false);
  const [todaySession, setTodaySession] = useState<DailySessionResponse | null>(null);
  const [revisitedSession, setRevisitedSession] = useState<DailySessionResponse | null>(null);
  const [activeReviewTest, setActiveReviewTest] = useState<ReviewTestResponse | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('today');
  const [stageMode, setStageMode] = useState<StageMode>('focus');
  const [focusIndex, setFocusIndex] = useState(0);

  const [loadingSession, setLoadingSession] = useState(false);
  const [preparingSession, setPreparingSession] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [preparingTest, setPreparingTest] = useState(false);
  const [submittingTest, setSubmittingTest] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const authErrorFromUrl = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('auth_error');
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      window.localStorage.setItem('lv_tutor_theme', 'dark');
    } else {
      root.classList.remove('dark');
      window.localStorage.setItem('lv_tutor_theme', 'light');
    }
  }, [darkMode]);

  const handleStatsUpdated = useCallback((stats: UserDashboardStats) => {
    setAuth((prev) => (prev ? { ...prev, stats } : prev));
    setTodaySession((prev) => (prev ? { ...prev, stats } : prev));
    setRevisitedSession((prev) => (prev ? { ...prev, stats } : prev));
  }, []);

  const loadTodayEnvelope = useCallback(async () => {
    setLoadingSession(true);
    setErrorBanner(null);
    try {
      const env = await api.getTodaySession();
      setTodayDate(env.today_date);
      setTodayPrepared(env.prepared);
      setTodaySession(env.session);
      setFocusIndex(0);
      setAuth((prev) => (prev ? { ...prev, stats: env.stats } : prev));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось загрузить данные дня');
    } finally {
      setLoadingSession(false);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const state = await api.getAuthState();
      setAuth(state);
      if (state.authenticated) {
        await loadTodayEnvelope();
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Ошибка подключения к серверу');
    }
  }, [loadTodayEnvelope]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const activeSession = revisitedSession || todaySession;
  const isViewingPastSession = Boolean(revisitedSession);

  const applySessionUpdate = (updated: DailySessionResponse) => {
    if (revisitedSession && updated.id === revisitedSession.id) {
      setRevisitedSession(updated);
    }
    if (updated.is_today) {
      setTodaySession(updated);
      setTodayPrepared(true);
    }
    handleStatsUpdated(updated.stats);
  };

  const handleDevLogin = async () => {
    try {
      await api.devLogin();
      await bootstrap();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось выполнить вход');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setTodaySession(null);
    setRevisitedSession(null);
    setActiveReviewTest(null);
    setTodayPrepared(false);
    setActiveTab('today');
    const state = await api.getAuthState();
    setAuth(state);
  };

  const handlePrepareToday = async () => {
    setPreparingSession(true);
    setErrorBanner(null);
    try {
      const prepared = await api.prepareTodaySession();
      setTodaySession(prepared);
      setTodayPrepared(true);
      setRevisitedSession(null);
      setFocusIndex(0);
      handleStatsUpdated(prepared.stats);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось подготовить урок');
    } finally {
      setPreparingSession(false);
    }
  };

  const handleUpdateGoal = async (goal: number) => {
    if (!auth?.user || auth.user.daily_goal === goal) return;
    setSavingSettings(true);
    setErrorBanner(null);
    try {
      const res = await api.updateSettings({ daily_goal: goal });
      setAuth((prev) => (prev ? { ...prev, user: res.user, stats: res.stats } : prev));
      if (todayPrepared && !isViewingPastSession) {
        setRegenerating(true);
        const nextSession = await api.regenerateSession();
        setTodaySession(nextSession);
        setFocusIndex(0);
        handleStatsUpdated(nextSession.stats);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось обновить цель');
    } finally {
      setSavingSettings(false);
      setRegenerating(false);
    }
  };

  const handleUpdateTheme = async (theme: ContextTheme) => {
    if (!auth?.user || auth.user.context_theme === theme) return;
    setSavingSettings(true);
    setErrorBanner(null);
    try {
      const res = await api.updateSettings({ context_theme: theme });
      setAuth((prev) => (prev ? { ...prev, user: res.user, stats: res.stats } : prev));
      if (todayPrepared && !isViewingPastSession) {
        setRegenerating(true);
        const nextSession = await api.regenerateSession();
        setTodaySession(nextSession);
        setFocusIndex(0);
        handleStatsUpdated(nextSession.stats);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось сменить контекст');
    } finally {
      setSavingSettings(false);
      setRegenerating(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setErrorBanner(null);
    try {
      const nextSession = await api.regenerateSession();
      setTodaySession(nextSession);
      setTodayPrepared(true);
      setRevisitedSession(null);
      setFocusIndex(0);
      handleStatsUpdated(nextSession.stats);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось перегенерировать урок');
    } finally {
      setRegenerating(false);
    }
  };

  const handleOpenPastSession = async (sessionId: number) => {
    setErrorBanner(null);
    try {
      const loaded = await api.getSessionById(sessionId);
      setActiveReviewTest(null);
      if (loaded.is_today) {
        setTodaySession(loaded);
        setTodayPrepared(true);
        setRevisitedSession(null);
      } else {
        setRevisitedSession(loaded);
      }
      setFocusIndex(0);
      setActiveTab('today');
      handleStatsUpdated(loaded.stats);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось открыть урок');
    }
  };

  const handleRelearnSession = async (sessionId: number) => {
    setErrorBanner(null);
    try {
      const reset = await api.relearnSession(sessionId);
      setActiveReviewTest(null);
      if (reset.is_today) {
        setTodaySession(reset);
        setTodayPrepared(true);
        setRevisitedSession(null);
      } else {
        setRevisitedSession(reset);
      }
      setFocusIndex(0);
      setActiveTab('today');
      handleStatsUpdated(reset.stats);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось сбросить прогресс урока');
    }
  };

  const handleStartSummaryTest = async (forceNew = false) => {
    setPreparingTest(true);
    setErrorBanner(null);
    try {
      const test = await api.prepareSummaryTest(forceNew);
      setActiveReviewTest(test);
      setRevisitedSession(null);
      setActiveTab('history');
      handleStatsUpdated(test.stats);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось подготовить итоговый тест');
    } finally {
      setPreparingTest(false);
    }
  };

  const handleOpenReviewTest = async (testId: number) => {
    setErrorBanner(null);
    try {
      const test = await api.getReviewTest(testId);
      setActiveReviewTest(test);
      setActiveTab('history');
      handleStatsUpdated(test.stats);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось загрузить тест');
    }
  };

  const handleSelectTestOption = async (questionId: string, optionIndex: number) => {
    if (!activeReviewTest || activeReviewTest.is_completed) return;
    const optimistic: ReviewTestResponse = {
      ...activeReviewTest,
      answers: {
        ...activeReviewTest.answers,
        choices: {
          ...activeReviewTest.answers.choices,
          [questionId]: optionIndex,
        },
      },
    };
    setActiveReviewTest(optimistic);
    try {
      const updated = await api.updateReviewTestAnswer(activeReviewTest.id, {
        type: 'choice',
        question_id: questionId,
        option_index: optionIndex,
      });
      setActiveReviewTest(updated);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось сохранить ответ');
      setActiveReviewTest(activeReviewTest);
    }
  };

  const handleTestPuzzleSolved = async (puzzleId: string, solved: boolean) => {
    if (!activeReviewTest || activeReviewTest.is_completed) return;
    const optimistic: ReviewTestResponse = {
      ...activeReviewTest,
      answers: {
        ...activeReviewTest.answers,
        puzzles_solved: {
          ...activeReviewTest.answers.puzzles_solved,
          [puzzleId]: solved,
        },
      },
    };
    setActiveReviewTest(optimistic);
    try {
      const updated = await api.updateReviewTestAnswer(activeReviewTest.id, {
        type: 'puzzle',
        puzzle_id: puzzleId,
        solved,
      });
      setActiveReviewTest(updated);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось сохранить ответ');
      setActiveReviewTest(activeReviewTest);
    }
  };

  const handleSubmitReviewTest = async () => {
    if (!activeReviewTest) return;
    setSubmittingTest(true);
    setErrorBanner(null);
    try {
      const graded = await api.submitReviewTest(activeReviewTest.id);
      setActiveReviewTest(graded);
      handleStatsUpdated(graded.stats);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось завершить тест');
    } finally {
      setSubmittingTest(false);
    }
  };

  const handleToggleWordCheck = async (
    wordId: number,
    field: 'translation' | 'pronunciation' | 'forms',
    value: boolean
  ) => {
    if (!activeSession) return;
    const key = String(wordId);
    const optimistic: DailySessionResponse = {
      ...activeSession,
      checkbox_state: {
        ...activeSession.checkbox_state,
        words: {
          ...activeSession.checkbox_state.words,
          [key]: {
            ...(activeSession.checkbox_state.words[key] || {
              translation: false,
              pronunciation: false,
              forms: false,
            }),
            [field]: value,
          },
        },
      },
    };
    applySessionUpdate(optimistic);
    try {
      const updated = await api.updateCheckbox({
        session_id: activeSession.id,
        type: 'word',
        word_id: wordId,
        field,
        value,
      });
      applySessionUpdate(updated);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Ошибка сохранения отметки');
      applySessionUpdate(activeSession);
    }
  };

  const handleToggleSynthesis = async (value: boolean) => {
    if (!activeSession) return;
    const optimistic: DailySessionResponse = {
      ...activeSession,
      checkbox_state: {
        ...activeSession.checkbox_state,
        synthesis_read: value,
      },
    };
    applySessionUpdate(optimistic);
    try {
      const updated = await api.updateCheckbox({
        session_id: activeSession.id,
        type: 'synthesis',
        value,
      });
      applySessionUpdate(updated);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Ошибка сохранения отметки');
      applySessionUpdate(activeSession);
    }
  };

  const handleTogglePuzzle = async (puzzleId: string, value: boolean) => {
    if (!activeSession) return;
    const optimistic: DailySessionResponse = {
      ...activeSession,
      checkbox_state: {
        ...activeSession.checkbox_state,
        puzzles_solved: {
          ...activeSession.checkbox_state.puzzles_solved,
          [puzzleId]: value,
        },
      },
    };
    applySessionUpdate(optimistic);
    try {
      const updated = await api.updateCheckbox({
        session_id: activeSession.id,
        type: 'puzzle',
        puzzle_id: puzzleId,
        value,
      });
      applySessionUpdate(updated);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Ошибка сохранения задания');
      applySessionUpdate(activeSession);
    }
  };

  const handleCompleteSession = async () => {
    if (!activeSession) return;
    setCompleting(true);
    setErrorBanner(null);
    try {
      const updated = await api.completeSession(activeSession.id);
      applySessionUpdate(updated);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Не удалось завершить тренировку');
    } finally {
      setCompleting(false);
    }
  };

  const progressMetrics = useMemo(() => {
    if (!activeSession) {
      return { completed: 0, total: 1, readyToComplete: false };
    }
    const cards = activeSession.ai_payload.word_cards;
    const puzzles = activeSession.ai_payload.puzzles;
    const total = cards.length * 3 + 1 + puzzles.length;
    let completed = 0;

    for (const card of cards) {
      const st = activeSession.checkbox_state.words[String(card.word_id)];
      if (st?.translation) completed += 1;
      if (st?.pronunciation) completed += 1;
      if (st?.forms) completed += 1;
    }
    if (activeSession.checkbox_state.synthesis_read) completed += 1;
    for (const p of puzzles) {
      if (activeSession.checkbox_state.puzzles_solved[p.id]) completed += 1;
    }

    return {
      completed,
      total,
      readyToComplete: completed >= total && total > 0,
    };
  }, [activeSession]);

  if (!auth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium">Загружаем Vārdu Rīga...</p>
        </div>
      </div>
    );
  }

  if (!auth.authenticated || !auth.user) {
    return (
      <LoginView
        googleConfigured={auth.google_configured}
        devBypass={auth.dev_bypass}
        authError={authErrorFromUrl}
        onDevLogin={handleDevLogin}
      />
    );
  }

  const user = auth.user;
  const stats: UserDashboardStats = activeSession?.stats || auth.stats || {
    streak_count: user.streak_count,
    mastered_count: 0,
    learning_count: 0,
    total_words: 120,
    due_review_count: 0,
    completed_sessions_count: 0,
    sessions_since_last_test: 0,
    summary_test_available: false,
    can_retake_summary_test: false,
    active_review_test_id: null,
  };
  const cards = activeSession?.ai_payload.word_cards || [];
  const activeCard = cards[Math.min(focusIndex, Math.max(0, cards.length - 1))];

  return (
    <div className="min-h-screen pb-24 md:pb-16">
      <header className="glass-header sticky top-0 z-30 border-b border-slate-200/75 dark:border-slate-800/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/25">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="block font-display text-base font-extrabold leading-none tracking-tight text-slate-900 dark:text-white">
                Vārdu Rīga
              </span>
              <span className="mt-0.5 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Тренажёр латышского
              </span>
            </div>
          </div>

          <nav className="hidden rounded-xl bg-slate-200/70 p-1 md:inline-flex dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => {
                setActiveReviewTest(null);
                setActiveTab('today');
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === 'today'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Сегодняшний урок
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveReviewTest(null);
                setActiveTab('history');
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              История уроков
              {stats.summary_test_available || stats.active_review_test_id ? (
                <span className="ml-0.5 inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveReviewTest(null);
                setActiveTab('dictionary');
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === 'dictionary'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Словарь
            </button>
            {auth.is_admin ? (
              <button
                type="button"
                onClick={() => {
                  setActiveReviewTest(null);
                  setActiveTab('admin');
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Админ
              </button>
            ) : null}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              aria-label={darkMode ? 'Включить светлую тему' : 'Включить тёмную тему'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white cursor-pointer"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="hidden items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 py-1 pl-2 pr-3 sm:flex dark:border-slate-700/80 dark:bg-slate-800/80">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600/15 text-xs font-bold text-blue-700 dark:bg-blue-500/25 dark:text-blue-300">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="max-w-[120px] truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                {user.name}
              </span>
            </div>

            {!auth.dev_bypass ? (
              <button
                type="button"
                onClick={handleLogout}
                title="Выйти"
                aria-label="Выйти из аккаунта"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 pt-6 sm:px-6">
        <AnimatePresence>
          {errorBanner ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>{errorBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-xs font-semibold underline cursor-pointer"
              >
                Скрыть
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {activeTab === 'admin' && auth.is_admin ? (
          <AdminDashboardView />
        ) : activeTab === 'dictionary' ? (
          <DictionaryView onStatsUpdated={handleStatsUpdated} />
        ) : activeTab === 'history' ? (
          activeReviewTest ? (
            <SummaryTestView
              test={activeReviewTest}
              submitting={submittingTest}
              onSelectOption={handleSelectTestOption}
              onPuzzleSolved={handleTestPuzzleSolved}
              onSubmit={handleSubmitReviewTest}
              onBack={() => setActiveReviewTest(null)}
              onStartNewTest={() => handleStartSummaryTest(true)}
            />
          ) : (
            <SessionHistoryView
              stats={stats}
              preparingTest={preparingTest}
              onStatsUpdated={handleStatsUpdated}
              onOpenSession={handleOpenPastSession}
              onRelearnSession={handleRelearnSession}
              onStartSummaryTest={(forceNew) => handleStartSummaryTest(Boolean(forceNew))}
              onOpenReviewTest={handleOpenReviewTest}
            />
          )
        ) : (
          <div className="flex flex-col gap-5 sm:gap-6">
            <div className={!activeSession && !loadingSession ? 'order-2 md:order-1' : ''}>
              <BentoDashboard
                user={user}
                stats={stats}
                sessionPrepared={Boolean(activeSession)}
                isViewingPastSession={isViewingPastSession}
                completedSteps={progressMetrics.completed}
                totalSteps={progressMetrics.total}
                reusedCount={activeSession?.ai_payload.reused_words.length || 0}
                regenerating={regenerating}
                savingSettings={savingSettings}
                preparingTest={preparingTest}
                onUpdateGoal={handleUpdateGoal}
                onUpdateTheme={handleUpdateTheme}
                onRegenerate={handleRegenerate}
                onStartSummaryTest={() => handleStartSummaryTest(false)}
              />
            </div>

            {loadingSession ? (
              <div className="bento-surface flex flex-col items-center justify-center gap-3 rounded-3xl p-14 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                <p className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Загружаем урок...
                </p>
              </div>
            ) : !activeSession ? (
              <div className="order-1 md:order-2">
                <PrepareSessionHero
                  user={user}
                  stats={stats}
                  todayDate={todayDate}
                  preparing={preparingSession}
                  onPrepare={handlePrepareToday}
                  onOpenHistory={() => setActiveTab('history')}
                  onStartSummaryTest={() => handleStartSummaryTest(false)}
                />
              </div>
            ) : (
              <div className="space-y-6">
                {isViewingPastSession ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-500/30 bg-blue-50/80 px-4 py-3 dark:border-blue-500/35 dark:bg-blue-950/30">
                    <div className="flex items-center gap-2.5 text-sm font-semibold text-blue-900 dark:text-blue-200">
                      <History className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span>Повторение прошлого урока от {activeSession.session_date}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRelearnSession(activeSession.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs transition hover:text-emerald-700 dark:bg-slate-800 dark:text-slate-100 cursor-pointer"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Сбросить отметки и пройти заново
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRevisitedSession(null);
                          setFocusIndex(0);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 cursor-pointer"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        К сегодняшнему дню
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
                      {activeSession.ai_payload.session_title_ru}
                    </h1>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                      {activeSession.ai_payload.session_intro_ru}
                    </p>
                  </div>

                  <div className="inline-flex rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800/80">
                    <button
                      type="button"
                      onClick={() => setStageMode('focus')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                        stageMode === 'focus'
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      По одному
                    </button>
                    <button
                      type="button"
                      onClick={() => setStageMode('grid')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                        stageMode === 'grid'
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      Все сразу
                    </button>
                  </div>
                </div>

                {activeSession.ai_payload.reused_words.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-50/70 px-4 py-2.5 dark:border-emerald-500/30 dark:bg-emerald-950/25">
                    <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      Повторение из вашего словаря:
                    </span>
                    {activeSession.ai_payload.reused_words.map((rw) => (
                      <span
                        key={rw.word_id}
                        className="rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-emerald-800 shadow-2xs dark:bg-slate-900/75 dark:text-emerald-300"
                      >
                        {rw.latvian} — {rw.russian}
                      </span>
                    ))}
                  </div>
                ) : null}

                {stageMode === 'focus' && activeCard ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="no-scrollbar flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
                        {cards.map((card, idx) => {
                          const st = activeSession.checkbox_state.words[String(card.word_id)];
                          const done = Boolean(st?.translation && st?.pronunciation && st?.forms);
                          const current = idx === focusIndex;
                          return (
                            <button
                              key={card.word_id}
                              type="button"
                              onClick={() => setFocusIndex(idx)}
                              className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition sm:min-h-0 cursor-pointer ${
                                current
                                  ? 'border-blue-600 bg-blue-600 text-white shadow-xs shadow-blue-600/25'
                                  : done
                                    ? 'border-emerald-500/35 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                              <span>{card.latvian}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:items-center">
                        <button
                          type="button"
                          onClick={() => setFocusIndex((i) => Math.max(0, i - 1))}
                          disabled={focusIndex === 0}
                          className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 sm:min-h-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80 cursor-pointer"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Назад
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setFocusIndex((i) => Math.min(cards.length - 1, i + 1))
                          }
                          disabled={focusIndex >= cards.length - 1}
                          className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 sm:min-h-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80 cursor-pointer"
                        >
                          Далее
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <AnimatePresence mode="wait">
                      <WordCard
                        key={`${activeSession.id}_${activeCard.word_id}`}
                        card={activeCard}
                        index={focusIndex}
                        total={cards.length}
                        checks={
                          activeSession.checkbox_state.words[String(activeCard.word_id)] || {
                            translation: false,
                            pronunciation: false,
                            forms: false,
                          }
                        }
                        onToggleCheck={(field, val) =>
                          handleToggleWordCheck(activeCard.word_id, field, val)
                        }
                      />
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {cards.map((card, idx) => (
                      <WordCard
                        key={`${activeSession.id}_${card.word_id}`}
                        card={card}
                        index={idx}
                        total={cards.length}
                        compact
                        checks={
                          activeSession.checkbox_state.words[String(card.word_id)] || {
                            translation: false,
                            pronunciation: false,
                            forms: false,
                          }
                        }
                        onToggleCheck={(field, val) =>
                          handleToggleWordCheck(card.word_id, field, val)
                        }
                      />
                    ))}
                  </div>
                )}

                <SynthesisSection
                  sentences={activeSession.ai_payload.synthesis}
                  checked={activeSession.checkbox_state.synthesis_read}
                  onToggleChecked={handleToggleSynthesis}
                />

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {activeSession.ai_payload.puzzles.map((puzzle, idx) => (
                    <SentencePuzzleBuilder
                      key={`${activeSession.id}_${puzzle.id}_${activeSession.checkbox_state.puzzles_solved[puzzle.id] ? '1' : '0'}`}
                      puzzle={puzzle}
                      index={idx}
                      solved={Boolean(activeSession.checkbox_state.puzzles_solved[puzzle.id])}
                      onSolvedChange={(solved) => handleTogglePuzzle(puzzle.id, solved)}
                    />
                  ))}
                </div>

                <section className="bento-surface overflow-hidden rounded-3xl p-6">
                  {activeSession.is_completed && progressMetrics.readyToComplete ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-emerald-500/35 bg-gradient-to-br from-emerald-50 via-white to-blue-50/60 p-6 text-center sm:flex-row sm:text-left dark:border-emerald-500/35 dark:from-emerald-950/35 dark:via-slate-900 dark:to-blue-950/25"
                    >
                      <div className="flex flex-col items-center gap-4 sm:flex-row">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25">
                          <Award className="h-7 w-7" />
                        </div>
                        <div>
                          <h3 className="font-display text-xl font-extrabold text-slate-900 dark:text-white">
                            {isViewingPastSession
                              ? 'Повторение урока завершено!'
                              : 'Урок на сегодня завершён!'}
                          </h3>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            Слова добавлены в ваш словарь и вернутся в нужный момент для повторения. Серия дней:{' '}
                            <strong className="text-emerald-700 dark:text-emerald-300">
                              {stats.streak_count}
                            </strong>
                            .
                            {stats.summary_test_available
                              ? ' Открыт итоговый тест по последним 5 урокам!'
                              : (() => {
                                  const left = Math.max(0, 5 - stats.sessions_since_last_test);
                                  const unit =
                                    left === 1 ? 'урок' : left >= 2 && left <= 4 ? 'урока' : 'уроков';
                                  return ` До итогового теста за 5 уроков: ещё ${left} ${unit}.`;
                                })()}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {stats.summary_test_available ? (
                          <button
                            type="button"
                            onClick={() => handleStartSummaryTest(false)}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer"
                          >
                            <ClipboardCheck className="h-4 w-4" />
                            Пройти итоговый тест
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setActiveTab('history')}
                          className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 cursor-pointer"
                        >
                          История уроков
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                      <div>
                        <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                          {isViewingPastSession
                            ? 'Завершить повторное прохождение урока'
                            : 'Завершить сегодняшний урок'}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {progressMetrics.readyToComplete
                            ? 'Все шаги выполнены! Сохраните результат, чтобы закрепить слова и продлить серию.'
                            : `Выполнено ${progressMetrics.completed} из ${progressMetrics.total} шагов. Отметьте все пункты и соберите предложения, чтобы завершить урок.`}
                        </p>
                      </div>

                      <motion.button
                        type="button"
                        disabled={!progressMetrics.readyToComplete || completing}
                        onClick={handleCompleteSession}
                        whileHover={progressMetrics.readyToComplete ? { scale: 1.02 } : undefined}
                        whileTap={progressMetrics.readyToComplete ? { scale: 0.98 } : undefined}
                        className={`inline-flex min-h-[48px] w-full shrink-0 items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition sm:w-auto ${
                          progressMetrics.readyToComplete
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 cursor-pointer'
                            : 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500'
                        }`}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {completing
                          ? 'Сохраняем прогресс...'
                          : isViewingPastSession
                            ? 'Сохранить повторное прохождение'
                            : 'Завершить тренировку и сохранить прогресс'}
                      </motion.button>
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200/75 pt-5 text-xs text-slate-500 sm:flex-row dark:border-slate-800/80 dark:text-slate-400">
          <span>Vārdu Rīga — ежедневная практика латышского языка</span>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-700/80 dark:hover:text-white cursor-pointer"
          >
            <MessageSquarePlus className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            Предложить идею или сообщить об ошибке
          </button>
        </div>
      </footer>

      <nav
        aria-label="Мобильная навигация"
        className="glass-bottom-bar fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/85 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden dark:border-slate-800/85"
      >
        <div
          className={`mx-auto grid max-w-md gap-1 ${
            auth.is_admin ? 'grid-cols-4' : 'grid-cols-3'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setActiveReviewTest(null);
              setActiveTab('today');
            }}
            className={`flex min-h-[46px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold transition cursor-pointer ${
              activeTab === 'today'
                ? 'bg-blue-600/12 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Урок</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveReviewTest(null);
              setActiveTab('history');
            }}
            className={`relative flex min-h-[46px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold transition cursor-pointer ${
              activeTab === 'history'
                ? 'bg-blue-600/12 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className="relative">
              <History className="h-4 w-4" />
              {stats.summary_test_available || stats.active_review_test_id ? (
                <span className="absolute -right-1.5 -top-1 inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              ) : null}
            </span>
            <span>История</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveReviewTest(null);
              setActiveTab('dictionary');
            }}
            className={`flex min-h-[46px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold transition cursor-pointer ${
              activeTab === 'dictionary'
                ? 'bg-blue-600/12 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            <span>Словарь</span>
          </button>
          {auth.is_admin ? (
            <button
              type="button"
              onClick={() => {
                setActiveReviewTest(null);
                setActiveTab('admin');
              }}
              className={`flex min-h-[46px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold transition cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-blue-600/12 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Админ</span>
            </button>
          ) : null}
        </div>
      </nav>

      <FeedbackModal
        open={feedbackOpen}
        pageContext={activeTab}
        onClose={() => setFeedbackOpen(false)}
      />
    </div>
  );
}
