import { useState } from 'react';
import { BookOpen, Compass, Sparkles, Sun } from 'lucide-react';

interface MnemonicVisualProps {
  imageUrl: string | null;
  latvian: string;
  partOfSpeech: string;
  frequencyRank: number;
  imageQuery: string;
  compact?: boolean;
}

const PALETTES = [
  'from-blue-600/14 via-sky-500/10 to-indigo-500/12 dark:from-blue-500/20 dark:via-sky-500/10 dark:to-indigo-500/20',
  'from-emerald-600/14 via-teal-500/10 to-cyan-500/12 dark:from-emerald-500/20 dark:via-teal-500/10 dark:to-cyan-500/20',
  'from-amber-500/14 via-orange-400/10 to-rose-400/10 dark:from-amber-500/20 dark:via-orange-500/10 dark:to-rose-500/15',
  'from-indigo-600/14 via-blue-500/10 to-emerald-500/10 dark:from-indigo-500/20 dark:via-blue-500/10 dark:to-emerald-500/15',
];

export function MnemonicVisual({
  imageUrl,
  latvian,
  partOfSpeech,
  frequencyRank,
  imageQuery,
  compact = false,
}: MnemonicVisualProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const palette = PALETTES[frequencyRank % PALETTES.length];
  const heightClass = compact ? 'h-28' : 'h-40 sm:h-44';

  if (imageUrl && !imgFailed) {
    return (
      <div
        className={`relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100 dark:border-slate-700/60 dark:bg-slate-800 ${heightClass}`}
      >
        <img
          src={imageUrl}
          alt={latvian}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent" />
        <div className="absolute bottom-2.5 left-3 flex items-center gap-2">
          <span className="rounded-full bg-slate-950/60 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {imageQuery}
          </span>
        </div>
      </div>
    );
  }

  const Icon =
    partOfSpeech === 'глаг.'
      ? Compass
      : partOfSpeech === 'прил.'
        ? Sparkles
        : partOfSpeech === 'нареч.'
          ? Sun
          : BookOpen;

  return (
    <div
      className={`relative flex w-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/75 bg-gradient-to-br p-4 dark:border-slate-700/60 ${palette} ${heightClass}`}
    >
      <svg
        className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 opacity-[0.14] dark:opacity-[0.18]"
        viewBox="0 0 160 160"
        fill="none"
      >
        <circle cx="80" cy="80" r="62" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 6" />
        <path d="M80 18L142 80L80 142L18 80Z" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="80" cy="80" r="24" stroke="currentColor" strokeWidth="1.2" />
      </svg>

      <div className="relative flex items-center justify-between">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 text-blue-600 shadow-xs dark:bg-slate-900/70 dark:text-blue-400">
          <Icon className="h-4 w-4" />
        </span>
        <span className="rounded-full border border-slate-900/10 bg-white/70 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300">
          {partOfSpeech}
        </span>
      </div>

      <div className="relative">
        <p className="font-display text-3xl font-extrabold tracking-tight text-slate-900/80 dark:text-white/85">
          {latvian}
        </p>
        <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
          №{frequencyRank} в базовом словаре
        </p>
      </div>
    </div>
  );
}
