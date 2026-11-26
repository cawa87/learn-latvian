import { motion } from 'motion/react';
import {
  ClipboardCheck,
  Flame,
  GraduationCap,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  CONTEXT_THEME_META,
  type ContextTheme,
  type UserDashboardStats,
  type UserProfile,
} from '../../shared/types';
import { ProgressRing } from './ProgressRing';

interface BentoDashboardProps {
  user: UserProfile;
  stats: UserDashboardStats;
  sessionPrepared: boolean;
  isViewingPastSession: boolean;
  completedSteps: number;
  totalSteps: number;
  reusedCount: number;
  regenerating: boolean;
  savingSettings: boolean;
  preparingTest: boolean;
  onUpdateGoal: (goal: number) => void;
  onUpdateTheme: (theme: ContextTheme) => void;
  onRegenerate: () => void;
  onStartSummaryTest: () => void;
}

const GOALS = [3, 4, 5, 6, 7, 8, 9, 10];
const THEMES: ContextTheme[] = [
  'riga_everyday',
  'work_smalltalk',
  'nature_outdoors',
  'general',
];

export function BentoDashboard({
  user,
  stats,
  sessionPrepared,
  isViewingPastSession,
  completedSteps,
  totalSteps,
  reusedCount,
  regenerating,
  savingSettings,
  preparingTest,
  onUpdateGoal,
  onUpdateTheme,
  onRegenerate,
  onStartSummaryTest,
}: BentoDashboardProps) {
  const milestoneCount = Math.min(5, stats.sessions_since_last_test);
  const testReady = stats.summary_test_available || Boolean(stats.active_review_test_id);

  return (
    <section className="grid grid-cols-1 gap-3 sm:gap-3.5 md:grid-cols-12">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bento-surface flex items-center justify-between gap-3 rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:col-span-4"
      >
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
            <Flame className="h-3.5 w-3.5" />
            Серия дней
          </span>
          <div className="mt-2.5 flex items-baseline gap-2 sm:mt-3">
            <span className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
              {stats.streak_count}
            </span>
            <span className="text-xs font-medium text-slate-500 sm:text-sm dark:text-slate-400">
              {stats.streak_count === 1 ? 'день подряд' : 'дн. подряд'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {sessionPrepared
              ? `В повторении сегодня: ${reusedCount} слов`
              : `Уроков завершено: ${stats.completed_sessions_count}`}
          </p>
        </div>

        <ProgressRing
          completed={sessionPrepared ? completedSteps : 0}
          total={sessionPrepared ? totalSteps : 1}
          size={78}
          strokeWidth={7}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="bento-surface flex flex-col justify-between gap-3 rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:col-span-3"
      >
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/12 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            <GraduationCap className="h-3.5 w-3.5" />
            Выучено слов
          </span>
          <span className="text-xs font-semibold text-slate-400">
            из {stats.total_words}
          </span>
        </div>

        <div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-display text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {stats.mastered_count + stats.learning_count}
            </span>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              ({stats.mastered_count} освоено • {stats.learning_count} в работе)
            </span>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500"
              initial={false}
              animate={{
                width: `${Math.min(
                  100,
                  Math.round(
                    ((stats.mastered_count + stats.learning_count) /
                      Math.max(1, stats.total_words)) *
                      100
                  )
                )}%`,
              }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </div>
        </div>

        {testReady ? (
          <button
            type="button"
            disabled={preparingTest}
            onClick={onStartSummaryTest}
            className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            {preparingTest
              ? 'Готовим тест...'
              : stats.active_review_test_id
                ? 'Продолжить итоговый тест'
                : 'Итоговый тест (5 уроков)'}
          </button>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-100/80 px-2.5 py-2 dark:bg-slate-800/70">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
              Итоговый тест
            </span>
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((idx) => (
                <span
                  key={idx}
                  className={`h-1.5 w-3 rounded-full ${
                    idx < milestoneCount
                      ? 'bg-emerald-500'
                      : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                />
              ))}
              <span className="ml-1 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                {milestoneCount}/5
              </span>
            </div>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="bento-surface flex flex-col justify-between gap-3.5 rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:col-span-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Цель и контекст урока
            </span>
          </div>

          {sessionPrepared && !isViewingPastSession ? (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-blue-500/50 hover:text-blue-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-400 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
              Обновить урок
            </button>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5 sm:space-y-0">
            <span className="block text-xs font-medium text-slate-500 sm:mr-1 sm:inline dark:text-slate-400">
              Слов в день:
            </span>
            <div className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
              {GOALS.map((goal) => {
                const active = user.daily_goal === goal;
                return (
                  <button
                    key={goal}
                    type="button"
                    disabled={savingSettings}
                    onClick={() => onUpdateGoal(goal)}
                    className={`h-9 rounded-lg px-2 text-xs font-semibold transition sm:h-7 sm:min-w-7 cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white shadow-xs shadow-blue-600/30'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {goal}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5 sm:space-y-0">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 sm:mr-1 dark:text-slate-400">
              <MapPin className="h-3.5 w-3.5" />
              Контекст:
            </span>
            <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
              {THEMES.map((theme) => {
                const active = user.context_theme === theme;
                return (
                  <button
                    key={theme}
                    type="button"
                    disabled={savingSettings}
                    onClick={() => onUpdateTheme(theme)}
                    title={CONTEXT_THEME_META[theme].description}
                    className={`min-h-[36px] rounded-lg px-2.5 py-1.5 text-center text-xs font-semibold transition sm:min-h-0 sm:py-1 cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {CONTEXT_THEME_META[theme].label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
