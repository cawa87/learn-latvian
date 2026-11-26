import { motion } from 'motion/react';

interface AnimatedCheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

export function AnimatedCheckbox({
  checked,
  onChange,
  label,
  sublabel,
  disabled = false,
}: AnimatedCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`group flex min-h-[44px] w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
        checked
          ? 'border-emerald-500/30 bg-emerald-50/80 dark:border-emerald-500/35 dark:bg-emerald-950/30'
          : 'border-slate-200/80 bg-white/70 hover:border-slate-300 hover:bg-slate-50/90 dark:border-slate-700/60 dark:bg-slate-900/50 dark:hover:border-slate-600 dark:hover:bg-slate-800/80'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <motion.span
        animate={{
          scale: checked ? [1, 1.12, 1] : 1,
          backgroundColor: checked ? '#059669' : 'rgba(255,255,255,0)',
          borderColor: checked ? '#059669' : '#94A3B8',
        }}
        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px]"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <motion.path
            d="M3.2 8.4L6.4 11.4L12.8 4.8"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          />
        </svg>
      </motion.span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm font-medium leading-snug transition-colors ${
            checked
              ? 'text-emerald-900 dark:text-emerald-200'
              : 'text-slate-700 dark:text-slate-200'
          }`}
        >
          {label}
        </span>
        {sublabel ? (
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
            {sublabel}
          </span>
        ) : null}
      </span>
    </button>
  );
}
