import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Award,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  CONTEXT_THEME_META,
  type ReviewTestHistoryItem,
  type SessionHistoryItem,
  type UserDashboardStats,
} from '../../shared/types';
import { api } from '../api';

interface SessionHistoryViewProps {
  stats: UserDashboardStats;
  preparingTest: boolean;
  onStatsUpdated: (stats: UserDashboardStats) => void;
  onOpenSession: (sessionId: number) => void;
  onRelearnSession: (sessionId: number) => void;
  onStartSummaryTest: (forceNew?: boolean) => void;
  onOpenReviewTest: (testId: number) => void;
}

function formatDateRu(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function SessionHistoryView({
  stats,
  preparingTest,
  onStatsUpdated,
  onOpenSession,
  onRelearnSession,
  onStartSummaryTest,
  onOpenReviewTest,
}: SessionHistoryViewProps) {
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [reviewTests, setReviewTests] = useState<ReviewTestHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [relearningId, setRelearningId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.getSessionHistory();
        if (!cancelled) {
          setSessions(res.sessions);
          setReviewTests(res.review_tests);
          onStatsUpdated(res.stats);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onStatsUpdated]);

  const progressTowardTest = Math.min(5, stats.sessions_since_last_test);
  const remainingForTest = Math.max(0, 5 - stats.sessions_since_last_test);
  const remainingLessonsLabel =
    remainingForTest === 1
      ? '1 урок'
      : remainingForTest >= 2 && remainingForTest <= 4
        ? `${remainingForTest} урока`
        : `${remainingForTest} уроков`;

  return (
    <section className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bento-surface relative overflow-hidden rounded-3xl p-6 ${
          stats.summary_test_available || stats.active_review_test_id
            ? 'ring-1 ring-emerald-500/40 dark:ring-emerald-500/35'
            : ''
        }`}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Итоговый тест за 5 уроков
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Пройдено уроков: {stats.completed_sessions_count}
              </span>
            </div>

            <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-white">
              {stats.active_review_test_id
                ? 'У вас есть незавершённый итоговый тест'
                : stats.summary_test_available
                  ? 'Итоговый тест по последним 5 урокам открыт!'
                  : stats.can_retake_summary_test
                    ? `До следующего итогового теста: ещё ${remainingLessonsLabel}`
                    : `Пройдите ещё ${remainingLessonsLabel}, чтобы открыть итоговый тест`}
            </h2>

            <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              После каждых 5 пройденных уроков открывается проверка по всем новым словам: перевод в контексте, выбор нужного падежа и сборка фраз.
            </p>

            <div className="flex items-center gap-2 pt-1">
              {[0, 1, 2, 3, 4].map((slot) => {
                const filled = slot < progressTowardTest || stats.summary_test_available;
                return (
                  <div
                    key={slot}
                    className={`h-2.5 flex-1 max-w-[68px] rounded-full transition-colors ${
                      filled
                        ? 'bg-emerald-500'
                        : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                );
              })}
              <span className="ml-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                {progressTowardTest} / 5
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            {stats.active_review_test_id ? (
              <button
                type="button"
                onClick={() => onOpenReviewTest(stats.active_review_test_id!)}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 cursor-pointer"
              >
                <ClipboardCheck className="h-4 w-4" />
                Продолжить итоговый тест
              </button>
            ) : stats.summary_test_available ? (
              <button
                type="button"
                disabled={preparingTest}
                onClick={() => onStartSummaryTest(false)}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                {preparingTest ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Составляем тест...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Начать итоговый тест (5 уроков)
                  </>
                )}
              </button>
            ) : stats.can_retake_summary_test ? (
              <button
                type="button"
                disabled={preparingTest}
                onClick={() => onStartSummaryTest(true)}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60 dark:bg-emerald-950/35 dark:text-emerald-200 dark:hover:bg-emerald-950/60 cursor-pointer"
              >
                {preparingTest ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                    Составляем тест...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    Повторить тест по 5 урокам
                  </>
                )}
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <Clock className="h-4 w-4" />
                Откроется после 5 уроков
              </span>
            )}
          </div>
        </div>
      </motion.div>

      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">
            Пройденные уроки
          </h3>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Всего: {sessions.length}
          </span>
        </div>

        {loading ? (
          <div className="bento-surface rounded-3xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Загружаем историю уроков...
          </div>
        ) : sessions.length === 0 ? (
          <div className="bento-surface rounded-3xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Пока нет сохранённых уроков. Подготовьте сегодняшний урок на главной вкладке!
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {sessions.map((item) => {
              const themeMeta = CONTEXT_THEME_META[item.context_theme];
              const pct = Math.round(
                (item.completed_steps / Math.max(1, item.total_steps)) * 100
              );
              return (
                <motion.article
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bento-surface flex flex-col justify-between gap-4 rounded-3xl p-5"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <CalendarDays className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        {formatDateRu(item.session_date)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {themeMeta.shortLabel}
                        </span>
                        {item.is_completed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Завершён
                          </span>
                        ) : (
                          <span className="rounded-full bg-blue-600/12 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                            {pct}% пройдено
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-display text-base font-bold text-slate-900 dark:text-white">
                        {item.session_title_ru}
                      </h4>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {item.word_count} слов • {item.completed_steps} из {item.total_steps} шагов
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {item.words_preview.map((w) => (
                        <span
                          key={w.word_id}
                          className="rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700/70 dark:bg-slate-800/70 dark:text-slate-200"
                        >
                          <strong className="text-blue-700 dark:text-blue-300">{w.latvian}</strong>{' '}
                          <span className="text-slate-400">—</span> {w.russian}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-slate-200/70 pt-3.5 sm:flex-row sm:items-center dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => onOpenSession(item.id)}
                      className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 cursor-pointer"
                    >
                      Открыть урок
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={relearningId === item.id}
                      onClick={async () => {
                        setRelearningId(item.id);
                        try {
                          await onRelearnSession(item.id);
                        } finally {
                          setRelearningId(null);
                        }
                      }}
                      className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-500/50 hover:text-emerald-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Пройти заново
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </div>

      {reviewTests.length > 0 ? (
        <div className="space-y-3.5">
          <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">
            Пройденные итоговые тесты
          </h3>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {reviewTests.map((t) => {
              const pct =
                t.score !== null && t.max_score > 0
                  ? Math.round((t.score / t.max_score) * 100)
                  : null;
              return (
                <div
                  key={t.id}
                  className="bento-surface flex items-center justify-between gap-4 rounded-3xl p-5"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-amber-500" />
                      <h4 className="font-display text-base font-bold text-slate-900 dark:text-white">
                        {t.title_ru}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Уроки: {t.covered_dates[t.covered_dates.length - 1]} — {t.covered_dates[0]} • {t.word_count} слов
                    </p>
                    {t.is_completed && pct !== null ? (
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        Результат: {t.score} из {t.max_score} ({pct}%)
                      </p>
                    ) : (
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        В процессе прохождения
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenReviewTest(t.id)}
                    className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-500/50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    {t.is_completed ? 'Посмотреть разбор' : 'Продолжить'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
