import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Puzzle, RotateCcw, Sparkles } from 'lucide-react';
import type { SentencePuzzle } from '../../shared/types';
import { AnimatedCheckbox } from './AnimatedCheckbox';
import { SpeakButton } from './SpeakButton';

interface SentencePuzzleBuilderProps {
  puzzle: SentencePuzzle;
  index: number;
  solved: boolean;
  onSolvedChange: (solved: boolean) => void;
}

interface ChipItem {
  uid: string;
  token: string;
  isDistractor: boolean;
}

function deterministicShuffle(items: ChipItem[], seedText: string): ChipItem[] {
  const arr = [...items];
  let seed = 0;
  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
  }
  for (let i = arr.length - 1; i > 0; i -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function SentencePuzzleBuilder({
  puzzle,
  index,
  solved,
  onSolvedChange,
}: SentencePuzzleBuilderProps) {
  const allChips = useMemo(() => {
    const base: ChipItem[] = [
      ...puzzle.correct_tokens.map((token, i) => ({
        uid: `c_${i}_${token}`,
        token,
        isDistractor: false,
      })),
      ...puzzle.distractor_tokens.map((token, i) => ({
        uid: `d_${i}_${token}`,
        token,
        isDistractor: true,
      })),
    ];
    return deterministicShuffle(base, `${puzzle.id}_${puzzle.russian_prompt}`);
  }, [puzzle]);

  const [selectedUids, setSelectedUids] = useState<string[]>(() =>
    solved ? allChips.filter((c) => !c.isDistractor).map((c) => c.uid) : []
  );
  const [feedback, setFeedback] = useState<{
    kind: 'idle' | 'success' | 'error';
    messages: string[];
  }>({
    kind: solved ? 'success' : 'idle',
    messages: solved ? [puzzle.grammar_summary_ru] : [],
  });

  const chipMap = useMemo(() => new Map(allChips.map((c) => [c.uid, c])), [allChips]);
  const selectedSet = useMemo(() => new Set(selectedUids), [selectedUids]);
  const selectedChips = selectedUids
    .map((uid) => chipMap.get(uid))
    .filter((c): c is ChipItem => Boolean(c));
  const poolChips = allChips.filter((c) => !selectedSet.has(c.uid));

  const addChip = (uid: string) => {
    setSelectedUids((prev) => [...prev, uid]);
    if (feedback.kind !== 'idle') {
      setFeedback({ kind: 'idle', messages: [] });
    }
  };

  const removeChip = (uid: string) => {
    setSelectedUids((prev) => prev.filter((id) => id !== uid));
    if (feedback.kind !== 'idle') {
      setFeedback({ kind: 'idle', messages: [] });
    }
  };

  const resetTray = () => {
    setSelectedUids([]);
    setFeedback({ kind: 'idle', messages: [] });
  };

  const checkAnswer = () => {
    const userTokens = selectedChips.map((c) => c.token);
    const distractorLookup = new Map(
      puzzle.distractor_explanations.map((d) => [d.token.toLowerCase(), d.reason_ru])
    );

    const usedDistractors = selectedChips.filter((c) => c.isDistractor);
    const messages: string[] = [];

    if (usedDistractors.length > 0) {
      for (const d of usedDistractors) {
        const explanation = distractorLookup.get(d.token.toLowerCase());
        messages.push(
          explanation ||
            `Форма «${d.token}» не подходит по падежу или времени для этого предложения.`
        );
      }
      setFeedback({ kind: 'error', messages });
      return;
    }

    if (userTokens.length < puzzle.correct_tokens.length) {
      messages.push(
        `Не хватает ещё ${puzzle.correct_tokens.length - userTokens.length} сл. — добавьте недостающие слова из списка ниже.`
      );
      setFeedback({ kind: 'error', messages });
      return;
    }

    const isExactMatch =
      userTokens.length === puzzle.correct_tokens.length &&
      userTokens.every(
        (tok, idx) => tok.toLowerCase() === puzzle.correct_tokens[idx].toLowerCase()
      );

    if (!isExactMatch) {
      const firstMismatch = userTokens.findIndex(
        (tok, idx) => tok.toLowerCase() !== puzzle.correct_tokens[idx]?.toLowerCase()
      );
      messages.push(
        `Слова выбраны верно, но проверьте порядок слов начиная с позиции ${firstMismatch + 1} («${userTokens[firstMismatch]}»).`
      );
      setFeedback({ kind: 'error', messages });
      return;
    }

    setFeedback({
      kind: 'success',
      messages: [puzzle.grammar_summary_ru],
    });
    if (!solved) {
      onSolvedChange(true);
    }
  };

  return (
    <div className="bento-surface rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600/12 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
            <Puzzle className="h-3.5 w-3.5" />
            Собери предложение #{index + 1}
          </span>
          <p className="mt-2.5 font-display text-lg font-bold text-slate-900 dark:text-white">
            «{puzzle.russian_prompt}»
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Выберите нужные блоки слов в правильном порядке. Среди вариантов есть лишние падежные формы-ловушки!
          </p>
        </div>

        {solved ? (
          <SpeakButton
            text={puzzle.correct_tokens.join(' ')}
            label="Прослушать собранное предложение"
            size="sm"
          />
        ) : null}
      </div>

      <div
        className={`mt-4 min-h-[76px] rounded-2xl border-2 border-dashed p-3.5 transition-colors ${
          feedback.kind === 'success'
            ? 'border-emerald-500/50 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-950/25'
            : feedback.kind === 'error'
              ? 'border-amber-500/60 bg-amber-50/60 dark:border-amber-500/45 dark:bg-amber-950/20'
              : 'border-slate-300/80 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/50'
        }`}
      >
        {selectedChips.length === 0 ? (
          <p className="py-2 text-center text-sm text-slate-400 dark:text-slate-500">
            Нажимайте на слова ниже, чтобы собрать предложение на латышском...
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedChips.map((chip) => (
              <motion.button
                key={chip.uid}
                layoutId={`${puzzle.id}_${chip.uid}`}
                type="button"
                onClick={() => removeChip(chip.uid)}
                whileTap={{ scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                className={`rounded-xl border px-3.5 py-2 text-sm font-semibold shadow-xs transition cursor-pointer ${
                  feedback.kind === 'error' && chip.isDistractor
                    ? 'border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200'
                    : feedback.kind === 'success'
                      ? 'border-emerald-500/40 bg-emerald-600 text-white'
                      : 'border-blue-500/40 bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {chip.token}
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {poolChips.map((chip) => (
          <motion.button
            key={chip.uid}
            layoutId={`${puzzle.id}_${chip.uid}`}
            type="button"
            onClick={() => addChip(chip.uid)}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 450, damping: 28 }}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-xs transition hover:border-blue-500/50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-blue-400 cursor-pointer"
          >
            {chip.token}
          </motion.button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={checkAnswer}
          disabled={selectedChips.length === 0}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none cursor-pointer"
        >
          <Sparkles className="h-4 w-4" />
          Проверить
        </button>

        <button
          type="button"
          onClick={resetTray}
          disabled={selectedChips.length === 0}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-45 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/80 cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" />
          Очистить
        </button>
      </div>

      <AnimatePresence mode="wait">
        {feedback.kind === 'error' ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-4 rounded-2xl border border-amber-500/35 bg-amber-50/90 p-3.5 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <p className="font-semibold">Проверьте окончания и порядок слов:</p>
                {feedback.messages.map((msg, i) => (
                  <p key={i} className="leading-relaxed">
                    {msg}
                  </p>
                ))}
              </div>
            </div>
          </motion.div>
        ) : feedback.kind === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-4 rounded-2xl border border-emerald-500/35 bg-emerald-50/90 p-3.5 text-sm text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-200"
          >
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="font-semibold">Отлично! Предложение собрано без ошибок.</p>
                <p className="mt-1 leading-relaxed">{feedback.messages[0]}</p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mt-4">
        <AnimatedCheckbox
          checked={solved}
          onChange={onSolvedChange}
          label="Собрал предложение без ошибок"
          disabled={!solved}
          sublabel={
            solved
              ? 'Задание успешно засчитано'
              : 'Отметка появится автоматически после верной проверки'
          }
        />
      </div>
    </div>
  );
}
