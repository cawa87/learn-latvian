import { motion } from 'motion/react';
import { BookOpenCheck, LogIn, Sparkles } from 'lucide-react';

interface LoginViewProps {
  googleConfigured: boolean;
  devBypass: boolean;
  authError: string | null;
  onDevLogin: () => void;
}

export function LoginView({
  googleConfigured,
  devBypass,
  authError,
  onDevLogin,
}: LoginViewProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="bento-surface w-full max-w-md rounded-3xl p-8 text-center"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
          <BookOpenCheck className="h-7 w-7" />
        </div>

        <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Vārdu Rīga
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Ежедневный тренажёр латышского языка: 3–10 новых слов в день с интервальным повторением, разбором падежей и живыми диалогами в контексте Риги.
        </p>

        {authError ? (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900 dark:bg-amber-950/35 dark:text-amber-200">
            {authError}
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {googleConfigured ? (
            <a
              href="/api/auth/google"
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700"
            >
              <LogIn className="h-4 w-4" />
              Войти через Google
            </a>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              Чтобы включить вход через Google, задайте <code>GOOGLE_CLIENT_ID</code> и{' '}
              <code>GOOGLE_CLIENT_SECRET</code> в файле <code>.env</code>.
            </div>
          )}

          {devBypass ? (
            <button
              type="button"
              onClick={onDevLogin}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-blue-500/40 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 cursor-pointer"
            >
              <Sparkles className="h-4 w-4 text-blue-600" />
              Продолжить в локальном режиме
            </button>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
