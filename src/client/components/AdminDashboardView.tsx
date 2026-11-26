import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bug,
  Coins,
  Cpu,
  Lightbulb,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type {
  AdminOverviewResponse,
  FeedbackStatus,
} from '../../shared/types';
import { api } from '../api';

type FeedbackFilter = 'all' | 'proposal' | 'bug' | 'open';

const STATUS_META: Record<
  FeedbackStatus,
  { label: string; badgeClass: string }
> = {
  new: {
    label: 'Новое',
    badgeClass:
      'bg-blue-500/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  },
  in_progress: {
    label: 'В работе',
    badgeClass:
      'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  },
  resolved: {
    label: 'Решено',
    badgeClass:
      'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  },
  dismissed: {
    label: 'Отклонено',
    badgeClass:
      'bg-slate-200/80 text-slate-600 dark:bg-slate-700/70 dark:text-slate-300',
  },
};

const OPERATION_LABELS: Record<string, string> = {
  daily_session: 'Генерация урока дня',
  summary_test: 'Итоговый тест за 5 уроков',
  seed_enrichment: 'Обогащение словаря (seed)',
};

const PAGE_LABELS: Record<string, string> = {
  today: 'Сегодняшний урок',
  history: 'История уроков',
  dictionary: 'Словарь',
  admin: 'Админ-панель',
};

function formatNumber(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n));
}

function formatUsd(amount: number): string {
  if (amount === 0) return '$0.0000';
  if (amount < 0.01) return `$${amount.toFixed(5)}`;
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function formatTimestamp(iso: string): string {
  const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return iso;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
}

export function AdminDashboardView() {
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedbackFilter>('all');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadOverview = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const overview = await api.getAdminOverview();
      setData(overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить админ-панель');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOverview(false);
  }, [loadOverview]);

  const handleStatusChange = async (feedbackId: number, status: FeedbackStatus) => {
    setUpdatingId(feedbackId);
    try {
      const res = await api.updateAdminFeedback(feedbackId, { status });
      setData((prev) => {
        if (!prev) return prev;
        const nextFeedback = prev.feedback.map((item) =>
          item.id === feedbackId ? res.item : item
        );
        const openCount = nextFeedback.filter(
          (item) => item.status === 'new' || item.status === 'in_progress'
        ).length;
        return {
          ...prev,
          summary: {
            ...prev.summary,
            open_feedback_count: openCount,
          },
          feedback: nextFeedback,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить статус обращения');
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredFeedback = useMemo(() => {
    if (!data) return [];
    return data.feedback.filter((item) => {
      if (filter === 'proposal') return item.kind === 'proposal';
      if (filter === 'bug') return item.kind === 'bug';
      if (filter === 'open') return item.status === 'new' || item.status === 'in_progress';
      return true;
    });
  }, [data, filter]);

  const maxDailyTokens = useMemo(() => {
    if (!data || data.by_day.length === 0) return 1;
    return Math.max(1, ...data.by_day.map((d) => d.total_tokens));
  }, [data]);

  if (loading) {
    return (
      <div className="bento-surface flex flex-col items-center justify-center gap-3 rounded-3xl p-14 text-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Загружаем статистику и обращения...
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bento-surface rounded-3xl p-8 text-center">
        <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
        <button
          type="button"
          onClick={() => loadOverview(false)}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 cursor-pointer"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { summary } = data;
  const totalOutputTokens = summary.total_candidates_tokens + summary.total_thoughts_tokens;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/12 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Панель администратора
          </div>
          <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            Токены, расходы и обращения
          </h1>
        </div>

        <button
          type="button"
          onClick={() => loadOverview(true)}
          disabled={refreshing}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/35 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bento-surface rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Всего токенов
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/12 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
              <Cpu className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-3xl font-extrabold text-slate-900 dark:text-white">
            {formatNumber(summary.total_tokens)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Вход: {formatNumber(summary.total_prompt_tokens)} · Выход:{' '}
            {formatNumber(totalOutputTokens)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
            Запросов: {formatNumber(summary.total_requests)} · За 30 дн.:{' '}
            {formatNumber(summary.last_30_days_tokens)}
          </p>
        </div>

        <div className="bento-surface rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Расходы (USD)
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-3xl font-extrabold text-slate-900 dark:text-white">
            {formatUsd(summary.total_cost_usd)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            За последние 30 дней: {formatUsd(summary.last_30_days_cost_usd)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
            Расчёт по тарифам Gemini API
          </p>
        </div>

        <div className="bento-surface rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Идеи и ошибки
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
              <MessageSquareText className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-3xl font-extrabold text-slate-900 dark:text-white">
            {formatNumber(summary.total_feedback_count)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Открытых обращений:{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {formatNumber(summary.open_feedback_count)}
            </strong>
          </p>
        </div>

        <div className="bento-surface rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Активность
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-3xl font-extrabold text-slate-900 dark:text-white">
            {formatNumber(summary.total_users)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Пользователей · Создано уроков: {formatNumber(summary.total_sessions)}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bento-surface rounded-3xl p-5">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Расход токенов по дням (14 дней)
            </h2>
          </div>

          {data.by_day.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Пока нет записанных API-запросов. Статистика появится сразу после генерации уроков или тестов.
            </p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {data.by_day.map((day) => {
                const widthPct = Math.max(4, Math.round((day.total_tokens / maxDailyTokens) * 100));
                return (
                  <div key={day.day} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {day.day}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {formatNumber(day.total_tokens)} ток. · {formatUsd(day.cost_usd)} ({day.requests} запр.)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-blue-600 dark:bg-blue-500"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bento-surface space-y-5 rounded-3xl p-5">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Разбивка по моделям и операциям
            </h2>
            {data.by_model.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Нет данных по моделям.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {data.by_model.map((m) => (
                  <div
                    key={m.model}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 text-xs dark:border-slate-700/70 dark:bg-slate-800/50"
                  >
                    <div>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {m.model}
                      </span>
                      <span className="ml-2 text-slate-500 dark:text-slate-400">
                        ({m.requests} запр.)
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                        {formatUsd(m.cost_usd)}
                      </span>
                      <span className="ml-2 text-slate-500 dark:text-slate-400">
                        {formatNumber(m.total_tokens)} ток.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.by_operation.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                По операциям
              </h3>
              <div className="mt-2 space-y-2">
                {data.by_operation.map((op) => (
                  <div
                    key={op.operation}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/70 px-3.5 py-2 text-xs dark:border-slate-700/60"
                  >
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {OPERATION_LABELS[op.operation] || op.operation}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {op.requests} запр. · {formatNumber(op.total_tokens)} ток. ·{' '}
                      <strong className="text-slate-800 dark:text-slate-100">
                        {formatUsd(op.cost_usd)}
                      </strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="bento-surface rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Предложения и сообщения об ошибках
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Всего записей: {data.feedback.length}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['all', 'Все'],
                ['open', 'Открытые'],
                ['proposal', 'Предложения'],
                ['bug', 'Ошибки'],
              ] as Array<[FeedbackFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  filter === key
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredFeedback.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Обращений по выбранному фильтру пока нет.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {filteredFeedback.map((item) => {
              const statusMeta = STATUS_META[item.status];
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200/85 bg-white/80 p-4 dark:border-slate-700/80 dark:bg-slate-900/60"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            item.kind === 'bug'
                              ? 'bg-rose-500/15 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                              : 'bg-blue-500/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                          }`}
                        >
                          {item.kind === 'bug' ? (
                            <Bug className="h-3 w-3" />
                          ) : (
                            <Lightbulb className="h-3 w-3" />
                          )}
                          {item.kind === 'bug' ? 'Ошибка' : 'Предложение'}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
                        >
                          {statusMeta.label}
                        </span>
                        {item.page_context ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            Экран: {PAGE_LABELS[item.page_context] || item.page_context}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                        {item.title}
                      </h3>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        {item.message}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {item.user_name} ({item.user_email}) · {formatTimestamp(item.created_at)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <select
                        value={item.status}
                        disabled={updatingId === item.id}
                        aria-label="Статус обращения"
                        onChange={(event) =>
                          handleStatusChange(item.id, event.target.value as FeedbackStatus)
                        }
                        className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                      >
                        <option value="new">Новое</option>
                        <option value="in_progress">В работе</option>
                        <option value="resolved">Решено</option>
                        <option value="dismissed">Отклонено</option>
                      </select>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="bento-surface rounded-3xl p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
          Последние запросы к модели
        </h2>
        {data.recent_usage.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Лог запросов пока пуст.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="py-2.5 pr-3 font-semibold">Время</th>
                  <th className="py-2.5 pr-3 font-semibold">Пользователь</th>
                  <th className="py-2.5 pr-3 font-semibold">Операция</th>
                  <th className="py-2.5 pr-3 font-semibold">Модель</th>
                  <th className="py-2.5 pr-3 text-right font-semibold">Вход</th>
                  <th className="py-2.5 pr-3 text-right font-semibold">Выход</th>
                  <th className="py-2.5 pr-3 text-right font-semibold">Всего</th>
                  <th className="py-2.5 text-right font-semibold">Стоимость</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.recent_usage.map((log) => (
                  <tr key={log.id} className="text-slate-700 dark:text-slate-200">
                    <td className="whitespace-nowrap py-2.5 pr-3 text-slate-500 dark:text-slate-400">
                      {formatTimestamp(log.created_at)}
                    </td>
                    <td className="py-2.5 pr-3">
                      {log.user_email || 'system'}
                    </td>
                    <td className="py-2.5 pr-3">
                      {OPERATION_LABELS[log.operation] || log.operation}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[11px]">{log.model}</td>
                    <td className="py-2.5 pr-3 text-right">
                      {formatNumber(log.prompt_tokens)}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      {formatNumber(log.candidates_tokens + log.thoughts_tokens)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold">
                      {formatNumber(log.total_tokens)}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatUsd(log.cost_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
