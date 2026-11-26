function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderPrivacyPage(contactEmail: string): string {
  const safeEmail = escapeHtml(contactEmail);
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Политика конфиденциальности / Privacy Policy — Vārdu Rīga</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #f8fafc;
        --card: #ffffff;
        --text: #0f172a;
        --muted: #475569;
        --border: #e2e8f0;
        --accent: #2563eb;
        --accent-soft: #eff6ff;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #0f172a;
          --card: #1e293b;
          --text: #f8fafc;
          --muted: #94a3b8;
          --border: #334155;
          --accent: #60a5fa;
          --accent-soft: rgba(37, 99, 235, 0.16);
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px 16px 56px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
        background: var(--bg);
        color: var(--text);
        line-height: 1.6;
      }
      .container {
        max-width: 760px;
        margin: 0 auto;
      }
      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 20px;
      }
      .brand {
        font-weight: 800;
        font-size: 18px;
        letter-spacing: -0.02em;
      }
      .back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--card);
        color: var(--text);
        text-decoration: none;
        font-size: 13px;
        font-weight: 600;
      }
      .back:hover { border-color: var(--accent); color: var(--accent); }
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 28px 28px 32px;
        margin-bottom: 20px;
      }
      .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 10px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 26px;
        line-height: 1.25;
        letter-spacing: -0.02em;
      }
      h2 {
        margin: 22px 0 8px;
        font-size: 16px;
        line-height: 1.35;
      }
      p, li {
        font-size: 14px;
        color: var(--muted);
      }
      ul {
        margin: 6px 0 0;
        padding-left: 20px;
      }
      li { margin-bottom: 6px; }
      a { color: var(--accent); }
      .meta {
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 16px;
      }
    </style>
  </head>
  <body>
    <main class="container">
      <div class="top">
        <span class="brand">Vārdu Rīga</span>
        <a class="back" href="/">← Вернуться в приложение</a>
      </div>

      <section class="card">
        <span class="badge">Русский</span>
        <h1>Политика конфиденциальности</h1>
        <p class="meta">Приложение: Vārdu Rīga (learn-latvian.cawa.work)</p>

        <p>
          Vārdu Rīga — персональный тренажёр для изучения латышского языка. Мы собираем только
          минимальный объём данных, необходимый для входа в аккаунт и сохранения вашего прогресса.
        </p>

        <h2>Какие данные мы получаем</h2>
        <ul>
          <li>
            <strong>Данные аккаунта Google</strong> (при входе через Google с базовыми правами
            <code>openid</code>, <code>email</code>, <code>profile</code>): идентификатор Google,
            имя, адрес электронной почты и ссылка на аватар.
          </li>
          <li>
            <strong>Учебные данные:</strong> выбранная дневная цель, пройденные уроки, прогресс
            по словам, результаты итоговых тестов и обращения, которые вы добровольно отправляете
            через форму обратной связи.
          </li>
        </ul>

        <h2>Как используются данные</h2>
        <ul>
          <li>Для аутентификации и сохранения вашего личного прогресса между устройствами.</li>
          <li>Для формирования уроков и повторений на основе слов, которые вы уже изучали.</li>
          <li>Мы не продаём данные, не показываем рекламу и не передаём личную информацию третьим лицам.</li>
        </ul>

        <h2>Файлы cookie</h2>
        <p>
          Приложение использует один технический <code>HttpOnly</code> cookie-файл
          (<code>lv_tutor_session</code>) исключительно для поддержания вашей сессии входа.
        </p>

        <h2>Удаление данных и контакты</h2>
        <p>
          Вы можете в любой момент запросить удаление своего аккаунта и всех связанных с ним
          данных, написав на <a href="mailto:${safeEmail}">${safeEmail}</a>.
        </p>
      </section>

      <section class="card" lang="en">
        <span class="badge">English</span>
        <h1>Privacy Policy</h1>
        <p class="meta">Application: Vārdu Rīga (learn-latvian.cawa.work)</p>

        <p>
          Vārdu Rīga is a Latvian language learning web application. We collect only the minimum
          information required to authenticate your account and store your learning progress.
        </p>

        <h2>Information We Collect</h2>
        <ul>
          <li>
            <strong>Google Account Information</strong> (via Google Sign-In using standard
            <code>openid</code>, <code>email</code>, and <code>profile</code> scopes): your Google
            account ID, display name, email address, and profile picture URL.
          </li>
          <li>
            <strong>Learning &amp; App Data:</strong> daily word goal, lesson history, vocabulary
            review progress, summary test results, and feedback messages you choose to submit.
          </li>
        </ul>

        <h2>How We Use Information</h2>
        <ul>
          <li>To sign you in and sync your personal vocabulary and lesson progress.</li>
          <li>To personalize daily lessons and spaced review schedules.</li>
          <li>We do not sell personal data, run third-party ad trackers, or share user data with third parties.</li>
        </ul>

        <h2>Cookies</h2>
        <p>
          We use a single <code>HttpOnly</code> session cookie (<code>lv_tutor_session</code>)
          strictly for keeping you signed in.
        </p>

        <h2>Data Deletion &amp; Contact</h2>
        <p>
          To request deletion of your account and all associated data, contact
          <a href="mailto:${safeEmail}">${safeEmail}</a>.
        </p>
      </section>
    </main>
  </body>
</html>`;
}
