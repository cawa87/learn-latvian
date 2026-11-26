import { useState } from 'react';
import { Eye, EyeOff, MessageSquareText } from 'lucide-react';
import type { AnnotatedSentence } from '../../shared/types';
import { AnimatedCheckbox } from './AnimatedCheckbox';
import { AnnotatedSentenceView } from './AnnotatedSentenceView';

interface SynthesisSectionProps {
  sentences: AnnotatedSentence[];
  checked: boolean;
  onToggleChecked: (val: boolean) => void;
}

export function SynthesisSection({
  sentences,
  checked,
  onToggleChecked,
}: SynthesisSectionProps) {
  const [showTranslations, setShowTranslations] = useState(false);

  return (
    <section className="bento-surface rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/12 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            <MessageSquareText className="h-3.5 w-3.5" />
            Мини-диалог
          </span>
          <h3 className="mt-2 font-display text-xl font-bold text-slate-900 dark:text-white">
            Слова урока в живой речи
          </h3>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Прочитайте диалог и нажмите на любое выделенное слово, чтобы посмотреть его форму и падеж.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowTranslations((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-500/50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
        >
          {showTranslations ? (
            <>
              <EyeOff className="h-3.5 w-3.5" />
              Скрыть перевод
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" />
              Показать перевод
            </>
          )}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {sentences.map((item, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700/60 dark:bg-slate-900/55"
          >
            <AnnotatedSentenceView
              lv={item.lv}
              ru={item.ru}
              speaker={item.speaker}
              annotations={item.annotations}
              showTranslation={showTranslations}
            />
          </div>
        ))}
      </div>

      <div className="mt-4">
        <AnimatedCheckbox
          checked={checked}
          onChange={onToggleChecked}
          label="Прочитал и понял диалог"
          sublabel="Отметьте, когда смысл всех фраз станет понятен без перевода"
        />
      </div>
    </section>
  );
}
