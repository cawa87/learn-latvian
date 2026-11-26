import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bug, CheckCircle2, Lightbulb, Send, X } from 'lucide-react';
import type { FeedbackKind } from '../../shared/types';
import { api } from '../api';

interface FeedbackModalProps {
  open: boolean;
  pageContext: string;
  onClose: () => void;
}

export function FeedbackModal({ open, pageContext, onClose }: FeedbackModalProps) {
  const [kind, setKind] = useState<FeedbackKind>('proposal');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitted(false);
    }
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) {
      setError('Напишите, пожалуйста, подробности предложения или ошибки.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.submitFeedback({
        kind,
        title: title.trim(),
        message: message.trim(),
        page_context: pageContext,
      });
      setSubmitted(true);
      setTitle('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить сообщение');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 backdrop-blur-xs sm:items-center sm:p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
              <div>
                <h2 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">
                  Идея или ошибка
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Поделитесь предложением по улучшению или сообщите о баге
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть окно"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700/80 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {submitted ? (
              <div className="space-y-4 px-5 py-7 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Спасибо! Сообщение получено
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Мы обязательно рассмотрим ваше обращение и учтём его в обновлениях Vārdu Rīga.
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80 cursor-pointer"
                  >
                    Отправить ещё
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[42px] rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 cursor-pointer"
                  >
                    Готово
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setKind('proposal')}
                    className={`flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition cursor-pointer ${
                      kind === 'proposal'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500/70 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Lightbulb className="h-4 w-4" />
                    Предложение
                  </button>
                  <button
                    type="button"
                    onClick={() => setKind('bug')}
                    className={`flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition cursor-pointer ${
                      kind === 'bug'
                        ? 'border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-500/70 dark:bg-rose-950/50 dark:text-rose-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Bug className="h-4 w-4" />
                    Ошибка / баг
                  </button>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Короткий заголовок (необязательно)
                  </label>
                  <input
                    type="text"
                    maxLength={140}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={
                      kind === 'bug'
                        ? 'Например: Неверный перевод слова в карточке'
                        : 'Например: Добавить тренажёр падежей'
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Описание
                  </label>
                  <textarea
                    rows={4}
                    maxLength={3000}
                    required
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder={
                      kind === 'bug'
                        ? 'Опишите, что произошло и на каком экране вы заметили ошибку...'
                        : 'Расскажите о вашей идее — что сделало бы обучение удобнее и полезнее?'
                    }
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>

                {error ? (
                  <p className="rounded-xl border border-rose-500/35 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    {error}
                  </p>
                ) : null}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80 cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-4 w-4" />
                    {submitting ? 'Отправляем...' : 'Отправить'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
