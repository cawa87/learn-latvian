import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookMarked, Sparkles, X } from 'lucide-react';
import type { TokenAnnotation } from '../../shared/types';
import { SpeakButton } from './SpeakButton';

interface AnnotatedSentenceViewProps {
  lv: string;
  ru?: string;
  speaker?: string;
  annotations: TokenAnnotation[];
  showTranslation?: boolean;
  onInspectAnnotation?: () => void;
}

interface TextSegment {
  text: string;
  annotation: TokenAnnotation | null;
}

function escapeRegExp(val: string): string {
  return val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function segmentSentence(lv: string, annotations: TokenAnnotation[]): TextSegment[] {
  if (!annotations || annotations.length === 0) {
    return [{ text: lv, annotation: null }];
  }

  const uniqueBySurface = new Map<string, TokenAnnotation>();
  for (const ann of annotations) {
    const clean = ann.surface_form.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!uniqueBySurface.has(key)) {
      uniqueBySurface.set(key, { ...ann, surface_form: clean });
    }
  }

  const sorted = Array.from(uniqueBySurface.values()).sort(
    (a, b) => b.surface_form.length - a.surface_form.length
  );

  if (sorted.length === 0) {
    return [{ text: lv, annotation: null }];
  }

  const letterClass = 'A-Za-zĀāČčĒēĢģĪīĶķĻļŅņŠšŪūŽž';
  const pattern = sorted.map((a) => escapeRegExp(a.surface_form)).join('|');
  const regex = new RegExp(`(?<![${letterClass}])(${pattern})(?![${letterClass}])`, 'gi');

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(lv)) !== null) {
    const start = match.index;
    const matchedText = match[0];
    if (start > lastIndex) {
      segments.push({ text: lv.slice(lastIndex, start), annotation: null });
    }
    const found = uniqueBySurface.get(matchedText.toLowerCase()) || null;
    segments.push({ text: matchedText, annotation: found });
    lastIndex = start + matchedText.length;
  }

  if (lastIndex < lv.length) {
    segments.push({ text: lv.slice(lastIndex), annotation: null });
  }

  return segments.length > 0 ? segments : [{ text: lv, annotation: null }];
}

export function AnnotatedSentenceView({
  lv,
  ru,
  speaker,
  annotations,
  showTranslation = true,
  onInspectAnnotation,
}: AnnotatedSentenceViewProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const segments = useMemo(() => segmentSentence(lv, annotations), [lv, annotations]);

  useEffect(() => {
    if (!activeKey) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveKey(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveKey(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeKey]);

  const activeAnnotation = useMemo(() => {
    if (!activeKey) return null;
    const idx = Number(activeKey);
    return segments[idx]?.annotation ?? null;
  }, [activeKey, segments]);

  return (
    <div ref={containerRef} className="relative space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {speaker ? (
            <span className="mb-1 inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {speaker}
            </span>
          ) : null}
          <p className="text-[16px] leading-relaxed font-medium text-slate-900 dark:text-slate-100">
            {segments.map((seg, idx) => {
              if (!seg.annotation) {
                return <span key={idx}>{seg.text}</span>;
              }
              const isSelected = activeKey === String(idx);
              const isNew = seg.annotation.is_new;

              return (
                <span key={idx} className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => {
                      const nextKey = isSelected ? null : String(idx);
                      setActiveKey(nextKey);
                      if (nextKey) onInspectAnnotation?.();
                    }}
                    className={`mx-[1px] inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/20 text-amber-800 ring-1 ring-amber-500/60 dark:bg-amber-500/25 dark:text-amber-200'
                        : isNew
                          ? 'bg-blue-600/12 text-blue-700 underline decoration-blue-500/50 decoration-dotted underline-offset-4 hover:bg-blue-600/20 dark:bg-blue-500/20 dark:text-blue-300 dark:hover:bg-blue-500/30'
                          : 'bg-emerald-600/12 text-emerald-700 underline decoration-emerald-500/50 decoration-dotted underline-offset-4 hover:bg-emerald-600/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-500/30'
                    }`}
                  >
                    <span>{seg.text}</span>
                    {!isNew ? (
                      <span className="rounded bg-emerald-600/15 px-1 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-300">
                        Повторение
                      </span>
                    ) : null}
                  </button>
                </span>
              );
            })}
          </p>
        </div>

        <SpeakButton text={lv} label="Озвучить предложение" size="sm" />
      </div>

      <AnimatePresence>
        {activeAnnotation ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="z-20 rounded-2xl border border-amber-500/35 bg-amber-50/95 p-3.5 shadow-lg shadow-amber-900/10 backdrop-blur-md dark:border-amber-500/40 dark:bg-slate-900/95 dark:shadow-black/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                  <BookMarked className="h-3 w-3" />
                  Грамматический разбор
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    activeAnnotation.is_new
                      ? 'bg-blue-600/12 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                      : 'bg-emerald-600/12 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  {activeAnnotation.is_new ? 'Новое слово' : 'Повторение'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <SpeakButton
                  text={activeAnnotation.surface_form}
                  label="Произнести форму слова"
                  size="sm"
                />
                <button
                  type="button"
                  onClick={() => setActiveKey(null)}
                  aria-label="Закрыть разбор"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-amber-500/15 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-white/80 px-3 py-2 dark:bg-slate-800/80">
                <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Форма в предложении
                </span>
                <span className="font-display text-base font-bold text-amber-700 dark:text-amber-300">
                  {activeAnnotation.surface_form}
                </span>
              </div>
              <div className="rounded-xl bg-white/80 px-3 py-2 dark:bg-slate-800/80">
                <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Начальная форма
                </span>
                <span className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {activeAnnotation.lemma}
                </span>
              </div>
            </div>

            <p className="mt-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {activeAnnotation.grammar_note_ru}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {ru && showTranslation ? (
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{ru}</p>
      ) : null}
    </div>
  );
}
