import { motion } from 'motion/react';
import {
  CalendarDays,
  ClipboardCheck,
  History,
  MapPin,
  Play,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  CONTEXT_THEME_META,
  type UserDashboardStats,
  type UserProfile,
} from '../../shared/types';

interface PrepareSessionHeroProps {
  user: UserProfile;
  stats: UserDashboardStats;
  todayDate: string;
  preparing: boolean;
  onPrepare: () => void;
  onOpenHistory: () => void;
  onStartSummaryTest: () => void;
}

function formatRussianDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function PrepareSessionHero({
  user,
  stats,
  todayDate,
  preparing,
  onPrepare,
  onOpenHistory,
  onStartSummaryTest,
}: PrepareSessionHeroProps) {
  const themeMeta = CONTEXT_THEME_META[user.context_theme];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="bento-surface relative overflow-hidden rounded-2xl p-5 sm:rounded-3xl sm:p-8"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-blue-600/8 blur-3xl dark:bg-blue-500/15" />
      <div className="pointer-events-none absolute -bottom-16 left-10 h-52 w-52 rounded-full bg-emerald-500/8 blur-3xl dark:bg-emerald-500/12" />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl space-y-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600/12 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatRussianDate(todayDate)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Target className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              {user.daily_goal} новых слов
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <MapPin className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              {themeMeta.label}
            </span>
          </div>

          <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            Готовы к сегодняшнему уроку латышского?
          </h1>

          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Нажмите кнопку ниже — мы подберём <strong>{user.daily_goal}</strong> новых частотных слов,
            {stats.due_review_count > 0
              ? ` добавим слова на интервальное повторение (${stats.due_review_count} ждут проверки)`
              : ' составим живые примеры с разбором падежей'}
            {' '}и подготовим мини-диалог и конструктор предложений в теме «{themeMeta.label}».
          </p>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Вы можете изменить количество слов или контекст в панели сверху перед запуском.
          </p>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2.5 sm:flex-row lg:w-auto lg:flex-col">
          <motion.button
            type="button"
            disabled={preparing}
            onClick={onPrepare}
            whileHover={!preparing ? { scale: 1.02 } : undefined}
            whileTap={!preparing ? { scale: 0.98 } : undefined}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-75 sm:w-auto cursor-pointer"
          >
            {preparing ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Готовим урок...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                Подготовить сегодняшний урок
              </>
            )}
          </motion.button>

          {stats.summary_test_available || stats.active_review_test_id ? (
            <button
              type="button"
              onClick={onStartSummaryTest}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-600/12 px-5 py-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-600/20 dark:bg-emerald-500/20 dark:text-emerald-200 cursor-pointer"
            >
              <ClipboardCheck className="h-4 w-4" />
              {stats.active_review_test_id
                ? 'Продолжить итоговый тест'
                : 'Пройти итоговый тест (5 уроков)'}
            </button>
          ) : null}

          {stats.completed_sessions_count > 0 ? (
            <button
              type="button"
              onClick={onOpenHistory}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-semibold text-slate-700 transition hover:border-blue-500/40 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <History className="h-4 w-4" />
              Открыть прошлые уроки ({stats.completed_sessions_count})
            </button>
          ) : (
            <div className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              После 5 уроков откроется итоговый тест
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}
