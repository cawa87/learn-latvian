import { motion } from 'motion/react';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  ClipboardCheck,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type { ReviewTestResponse } from '../../shared/types';
import { ProgressRing } from './ProgressRing';
import { SentencePuzzleBuilder } from './SentencePuzzleBuilder';
import { SpeakButton } from './SpeakButton';

interface SummaryTestViewProps {
  test: ReviewTestResponse;
  submitting: boolean;
  onSelectOption: (questionId: string, optionIndex: number) => void;
  onPuzzleSolved: (puzzleId: string, solved: boolean) => void;
  onSubmit: () => void;
  onBack: () => void;
  onStartNewTest: () => void;
}

export function SummaryTestView({
  test,
  submitting,
  onSelectOption,
  onPuzzleSolved,
  onSubmit,
  onBack,
  onStartNewTest,
}: SummaryTestViewProps) {
  const answeredQuestions = test.payload.questions.filter(
    (q) => typeof test.answers.choices[q.id] === 'number'
  ).length;
  const solvedPuzzles = test.payload.puzzles.filter(
    (p) => Boolean(test.answers.puzzles_solved[p.id])
  ).length;
  const totalItems = test.payload.questions.length + test.payload.puzzles.length;
  const completedItems = answeredQuestions + solvedPuzzles;
  const allQuestionsAnswered = answeredQuestions === test.payload.questions.length;

  return (
    <section className="space-y-6">
      <div className="bento-surface rounded-2xl p-4 sm:rounded-3xl sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Назад к истории уроков
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Итоговый экзамен (5 уроков)
              </span>
            </div>

            <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {test.payload.title_ru}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {test.payload.intro_ru}
            </p>
          </div>

          <ProgressRing
            completed={test.is_completed && test.score !== null ? test.score : completedItems}
            total={test.max_score || totalItems}
            size={88}
            strokeWidth={7}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-200/70 pt-4 dark:border-slate-800">
          <span className="mr-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Проверяемые слова ({test.payload.covered_words.length}):
          </span>
          {test.payload.covered_words.slice(0, 18).map((w) => (
            <span
              key={w.word_id}
              className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {w.latvian}
            </span>
          ))}
          {test.payload.covered_words.length > 18 ? (
            <span className="text-xs text-slate-400">
              +{test.payload.covered_words.length - 18} ещё
            </span>
          ) : null}
        </div>
      </div>

      {test.is_completed && test.score !== null ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bento-surface flex flex-col items-center justify-between gap-4 rounded-3xl border-emerald-500/35 bg-gradient-to-br from-emerald-50 via-white to-blue-50/50 p-6 sm:flex-row dark:from-emerald-950/35 dark:via-slate-900 dark:to-blue-950/20"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25">
              <Award className="h-7 w-7" />
            </div>
            <div>
              <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-white">
                Итоговый тест завершён: {test.score} из {test.max_score} (
                {Math.round((test.score / Math.max(1, test.max_score)) * 100)}%)
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Коэффициенты запоминания обновлены: уверенные слова переведены ближе к «Выучено», а слова с ошибками автоматически вернутся в ближайшие уроки.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onStartNewTest}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Новый тест по 5 урокам
          </button>
        </motion.div>
      ) : null}

      <div className="space-y-4">
        {test.payload.questions.map((q, idx) => {
          const chosenIndex = test.answers.choices[q.id];
          const isAnswered = typeof chosenIndex === 'number';
          const isCorrect = isAnswered && chosenIndex === q.correct_index;

          return (
            <motion.article
              key={q.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="bento-surface rounded-3xl p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Вопрос {idx + 1} из {test.payload.questions.length}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        q.kind === 'case_choice'
                          ? 'bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                          : 'bg-blue-600/12 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                      }`}
                    >
                      {q.kind === 'case_choice' ? 'Падежи и формы' : 'Перевод в контексте'}
                    </span>
                    {test.is_completed ? (
                      isCorrect ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/12 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Верно
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/12 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                          <XCircle className="h-3.5 w-3.5" />
                          Есть ошибка
                        </span>
                      )
                    ) : null}
                  </div>

                  <p className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {q.prompt_lv}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{q.prompt_ru}</p>
                </div>

                <SpeakButton
                  text={q.prompt_lv.replace(/_____/g, q.latvian_word)}
                  size="sm"
                  label="Озвучить предложение"
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {q.options.map((opt, optIdx) => {
                  const selected = chosenIndex === optIdx;
                  const rightOption = optIdx === q.correct_index;

                  let buttonStyle =
                    'border-slate-200 bg-white text-slate-800 hover:border-blue-500/50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100';

                  if (test.is_completed) {
                    if (rightOption) {
                      buttonStyle =
                        'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-500/70 dark:bg-emerald-950/40 dark:text-emerald-200';
                    } else if (selected && !rightOption) {
                      buttonStyle =
                        'border-rose-500 bg-rose-50 text-rose-900 dark:border-rose-500/70 dark:bg-rose-950/40 dark:text-rose-200';
                    } else {
                      buttonStyle =
                        'border-slate-200/70 bg-slate-50/70 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-500';
                    }
                  } else if (selected) {
                    buttonStyle =
                      'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/20';
                  }

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      disabled={test.is_completed}
                      onClick={() => onSelectOption(q.id, optIdx)}
                      className={`flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${buttonStyle} ${
                        test.is_completed ? 'cursor-default' : 'cursor-pointer'
                      }`}
                    >
                      <span>{opt}</span>
                      {test.is_completed && rightOption ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : test.is_completed && selected && !rightOption ? (
                        <XCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {test.is_completed ? (
                <div className="mt-3.5 rounded-2xl border border-amber-500/30 bg-amber-50/75 px-4 py-3 text-xs leading-relaxed text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/25 dark:text-amber-200">
                  <strong>Пояснение:</strong> {q.explanation_ru}
                </div>
              ) : null}
            </motion.article>
          );
        })}
      </div>

      {test.payload.puzzles.length > 0 ? (
        <div className="space-y-3">
          <h2 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">
            Финальная сборка предложений
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {test.payload.puzzles.map((puzzle, idx) => (
              <SentencePuzzleBuilder
                key={`exam_${test.id}_${puzzle.id}`}
                puzzle={puzzle}
                index={idx}
                solved={Boolean(test.answers.puzzles_solved[puzzle.id])}
                onSolvedChange={(solved) => onPuzzleSolved(puzzle.id, solved)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {!test.is_completed ? (
        <div className="bento-surface flex flex-col items-start justify-between gap-4 rounded-3xl p-6 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Проверка итогового теста
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Отвечено на {answeredQuestions} из {test.payload.questions.length} вопросов, собрано {solvedPuzzles} из {test.payload.puzzles.length} предложений.
            </p>
          </div>

          <button
            type="button"
            disabled={!allQuestionsAnswered || submitting}
            onClick={onSubmit}
            className={`inline-flex min-h-[48px] w-full shrink-0 items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition sm:w-auto ${
              allQuestionsAnswered
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 cursor-pointer'
                : 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            {submitting
              ? 'Проверяем ответы...'
              : 'Завершить итоговый тест и проверить ответы'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
