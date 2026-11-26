import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown,
  Hash,
  LayoutGrid,
  List,
  Search,
  Sparkles,
} from 'lucide-react';
import type { DictionaryWordItem, UserDashboardStats, WordStatus } from '../../shared/types';
import { api } from '../api';
import { AnnotatedSentenceView } from './AnnotatedSentenceView';
import { SpeakButton } from './SpeakButton';

interface DictionaryViewProps {
  onStatsUpdated: (stats: UserDashboardStats) => void;
}

const STATUS_TABS: Array<{ id: 'all' | WordStatus; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'mastered', label: 'Выученные' },
  { id: 'learning', label: 'В процессе' },
  { id: 'new', label: 'Новые' },
];

const STATUS_META: Record<WordStatus, { label: string; badgeClass: string }> = {
  mastered: {
    label: 'Выучено',
    badgeClass:
      'bg-emerald-600/12 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  },
  learning: {
    label: 'В процессе',
    badgeClass: 'bg-blue-600/12 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  },
  new: {
    label: 'Новое',
    badgeClass: 'bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
};

export function DictionaryView({ onStatsUpdated }: DictionaryViewProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WordStatus>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [items, setItems] = useState<DictionaryWordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.getDictionary(query, statusFilter);
        if (!cancelled) {
          setItems(res.items);
          onStatsUpdated(res.stats);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 140);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, statusFilter, onStatsUpdated]);

  const handleStatusChange = async (wordId: number, nextStatus: WordStatus) => {
    const res = await api.updateWordStatus(wordId, nextStatus);
    onStatsUpdated(res.stats);
    setItems((prev) =>
      prev
        .map((item) => (item.id === wordId ? { ...item, status: nextStatus } : item))
        .filter((item) => statusFilter === 'all' || item.status === statusFilter)
    );
  };

  return (
    <section className="space-y-4">
      <div className="bento-surface rounded-3xl p-5">
        <div className="flex flex-col gap-3.5 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по латышскому или русскому слову..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="no-scrollbar flex overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`shrink-0 flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition sm:flex-none sm:py-1.5 cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="inline-flex self-end rounded-xl bg-slate-100 p-1 sm:self-auto dark:bg-slate-800/80">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                aria-label="Табличный вид"
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Таблица
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                aria-label="Вид карточек"
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Карточки
              </button>
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Показано слов: <strong className="text-slate-700 dark:text-slate-200">{items.length}</strong>. Нажмите на любое слово, чтобы увидеть грамматическую справку и историю примеров из уроков.
        </p>
      </div>

      {loading ? (
        <div className="bento-surface rounded-3xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          Загружаем словарь...
        </div>
      ) : items.length === 0 ? (
        <div className="bento-surface rounded-3xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          По вашему фильтру слов не найдено.
        </div>
      ) : viewMode === 'table' ? (
        <div className="bento-surface overflow-hidden rounded-3xl">
          <div className="divide-y divide-slate-200/75 dark:divide-slate-800">
            {items.map((item) => {
              const isExpanded = expandedId === item.id;
              const meta = STATUS_META[item.status];
              return (
                <div key={item.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/35">
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="flex items-center justify-between gap-2.5 px-4 py-3.5 sm:px-5 cursor-pointer"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        #{item.frequency_rank}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-base font-bold text-slate-900 dark:text-white">
                            {item.latvian}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {item.part_of_speech}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {item.russian}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="hidden text-xs text-slate-500 sm:inline dark:text-slate-400">
                        Лёгкость: {item.ease_factor.toFixed(2)}
                      </span>
                      {item.times_reused_in_ai > 0 ? (
                        <span className="hidden items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 md:inline-flex dark:text-emerald-300">
                          <Sparkles className="h-3 w-3" />
                          Повторений: {item.times_reused_in_ai}×
                        </span>
                      ) : null}
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.badgeClass}`}>
                        {meta.label}
                      </span>
                      <SpeakButton text={item.latvian} size="sm" />
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden border-t border-slate-200/70 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/50"
                      >
                        <div className="space-y-4 px-5 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="max-w-2xl text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                              <strong className="text-slate-900 dark:text-white">Грамматика: </strong>
                              {item.grammar_note}
                            </p>
                            <div className="flex items-center gap-1.5">
                              {(['new', 'learning', 'mastered'] as WordStatus[]).map((st) => (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => handleStatusChange(item.id, st)}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                                    item.status === st
                                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                      : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                  }`}
                                >
                                  {STATUS_META[st].label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2.5">
                            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {item.past_sentences.length > 0
                                ? 'Предложения из прошлых уроков'
                                : 'Базовый пример из словаря'}
                            </span>

                            {item.past_sentences.length > 0 ? (
                              item.past_sentences.map((sent, sIdx) => (
                                <div
                                  key={sIdx}
                                  className="rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-700/60 dark:bg-slate-900/80"
                                >
                                  <span className="mb-1 inline-block text-[11px] font-medium text-slate-400">
                                    Урок от {sent.session_date}
                                  </span>
                                  <AnnotatedSentenceView
                                    lv={sent.lv}
                                    ru={sent.ru}
                                    annotations={sent.annotations}
                                  />
                                </div>
                              ))
                            ) : (
                              <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-700/60 dark:bg-slate-900/80">
                                <AnnotatedSentenceView
                                  lv={item.fallback_example_lv}
                                  ru={item.fallback_example_ru}
                                  annotations={[]}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const meta = STATUS_META[item.status];
            return (
              <div
                key={item.id}
                className="bento-surface flex flex-col justify-between gap-3 rounded-3xl p-5"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400">
                      <Hash className="h-3 w-3" />
                      {item.frequency_rank} • {item.part_of_speech}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}>
                      {meta.label}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                        {item.latvian}
                      </h4>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        {item.russian}
                      </p>
                    </div>
                    <SpeakButton text={item.latvian} size="sm" />
                  </div>

                  <p className="mt-2.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {item.grammar_note}
                  </p>
                </div>

                <div className="space-y-2 border-t border-slate-200/70 pt-3 dark:border-slate-800">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    {item.past_sentences[0]?.lv || item.fallback_example_lv}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {item.past_sentences[0]?.ru || item.fallback_example_ru}
                  </p>
                  <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                    <span>Лёгкость: {item.ease_factor.toFixed(2)}</span>
                    <span>В уроках: {item.times_reused_in_ai}×</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
