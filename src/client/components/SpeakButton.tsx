import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { speakLatvian } from '../speech';

interface SpeakButtonProps {
  text: string;
  label?: string;
  size?: 'sm' | 'md';
  onSpoken?: () => void;
}

export function SpeakButton({
  text,
  label = 'Озвучить на латышском',
  size = 'md',
  onSpoken,
}: SpeakButtonProps) {
  const [speaking, setSpeaking] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    speakLatvian(text, {
      onStart: () => setSpeaking(true),
      onEnd: () => {
        setSpeaking(false);
        onSpoken?.();
      },
    });
  };

  const sizeClass =
    size === 'sm' ? 'h-8 px-2.5 text-xs gap-1.5 rounded-lg' : 'h-10 px-3.5 text-sm gap-2 rounded-xl';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center border font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 cursor-pointer ${sizeClass} ${
        speaking
          ? 'border-blue-500/40 bg-blue-600 text-white shadow-sm shadow-blue-600/25'
          : 'border-slate-200/90 bg-white/90 text-slate-700 hover:border-blue-500/40 hover:text-blue-600 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-blue-500/50 dark:hover:text-blue-400'
      }`}
    >
      {speaking ? (
        <span className="flex h-3.5 items-end gap-[2px]" aria-hidden="true">
          <span className="animate-wave-1 h-full w-[2.5px] origin-bottom rounded-full bg-current" />
          <span className="animate-wave-2 h-full w-[2.5px] origin-bottom rounded-full bg-current" />
          <span className="animate-wave-3 h-full w-[2.5px] origin-bottom rounded-full bg-current" />
        </span>
      ) : (
        <Volume2 className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      )}
      {size === 'md' ? <span>{speaking ? 'Звучит...' : 'Слушать'}</span> : null}
    </button>
  );
}
