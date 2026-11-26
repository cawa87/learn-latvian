import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, CheckCircle2, ChevronDown, Hash, Sparkles } from 'lucide-react';
import type { SessionWordCard, WordCheckboxState } from '../../shared/types';
import { AnimatedCheckbox } from './AnimatedCheckbox';
import { AnnotatedSentenceView } from './AnnotatedSentenceView';
import { MnemonicVisual } from './MnemonicVisual';
import { SpeakButton } from './SpeakButton';

interface WordCardProps {
  card: SessionWordCard;
  index: number;
  total: number;
  checks: WordCheckboxState;
  compact?: boolean;
  onToggleCheck: (field: 'translation' | 'pronunciation' | 'forms', value: boolean) => void;
}

export function WordCard({
  card,
  index,
  total,
  checks,
  compact = false,
  onToggleCheck,
}: WordCardProps) {
  const [grammarOpen, setGrammarOpen] = useState(!compact);
  const allChecked = checks.translation && checks.pronunciation && checks.forms;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      className={`bento-surface relative overflow-hidden rounded-2xl p-4 sm:rounded-3xl sm:p-6 ${
        allChecked
          ? 'ring-1 ring-emerald-500/40 dark:ring-emerald-500/35'
          : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-blue-600/12 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
            Слово {index + 1} из {total}
          </span>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {card.part_of_speech}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Hash className="h-3 w-3" />
            {card.frequency_rank} в языке
          </span>
        </div>

        {allChecked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/12 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Карточка пройдена
          </span>
        ) : null}
      </div>

      <div className={`mt-4 grid gap-5 ${compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-12'}`}>
        <div className={compact ? '' : 'lg:col-span-5'}>
          <MnemonicVisual
            imageUrl={card.image_url}
            latvian={card.latvian}
            partOfSpeech={card.part_of_speech}
            frequencyRank={card.frequency_rank}
            imageQuery={card.image_query}
            compact={compact}
          />

          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words font-display text-2xl font-extrabold tracking-tight text-blue-600 sm:text-3xl dark:text-blue-400">
                {card.latvian}
              </h2>
              <p className="mt-1 text-base font-semibold text-slate-800 sm:text-lg dark:text-slate-100">
                {card.russian}
              </p>
            </div>
            <SpeakButton
              text={card.latvian}
              label={`Произнести слово ${card.latvian}`}
            />
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/80 dark:border-slate-700/60 dark:bg-slate-800/45">
            <button
              type="button"
              onClick={() => setGrammarOpen((prev) => !prev)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer"
            >
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                Грамматика
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  grammarOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            <AnimatePresence initial={false}>
              {grammarOpen ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden"
                >
                  <p className="border-t border-slate-200/70 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-slate-700/60 dark:text-slate-200">
                    {card.grammar_note_ru}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        <div className={`flex flex-col justify-between gap-4 ${compact ? '' : 'lg:col-span-7'}`}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                Живые примеры в контексте
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Нажмите на выделенное слово для разбора падежа
              </span>
            </div>

            {card.examples.map((ex, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-700/60 dark:bg-slate-900/55"
              >
                <AnnotatedSentenceView
                  lv={ex.lv}
                  ru={ex.ru}
                  annotations={ex.annotations}
                  showTranslation
                />
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-1">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Чек-лист закрепления
            </span>
            <AnimatedCheckbox
              checked={checks.translation}
              onChange={(val) => onToggleCheck('translation', val)}
              label="Изучил перевод и грамматику"
            />
            <AnimatedCheckbox
              checked={checks.pronunciation}
              onChange={(val) => onToggleCheck('pronunciation', val)}
              label="Прослушал и повторил вслух"
            />
            <AnimatedCheckbox
              checked={checks.forms}
              onChange={(val) => onToggleCheck('forms', val)}
              label="Разобрал формы слов в примерах"
            />
          </div>
        </div>
      </div>
    </motion.article>
  );
}
