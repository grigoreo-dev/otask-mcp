export function renderLoginPage(opts: { query: string; error?: string }): Response {
  const action = `/authorize?${opts.query}`;
  const errorHtml = opts.error ? `<p class="error" role="alert">${escapeHtml(opts.error)}</p>` : "";

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Вход — O!task MCP</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      font-family: system-ui, -apple-system, sans-serif;
      background: #f8fafc;
      color: #0f172a;
    }
    main {
      width: 100%;
      max-width: 28rem;
      background: #fff;
      border-radius: 0.75rem;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
      padding: 1.5rem;
    }
    h1 { margin: 0 0 0.75rem; font-size: 1.25rem; font-weight: 600; }
    .privacy { margin: 0 0 1rem; font-size: 0.875rem; color: #475569; line-height: 1.45; }
    .privacy a { color: #2563eb; }
    .error { color: #b91c1c; margin: 0 0 1rem; font-size: 0.875rem; }
    form { display: flex; flex-direction: column; gap: 0.75rem; }
    label { display: block; font-size: 0.875rem; }
    label span { display: block; font-weight: 500; margin-bottom: 0.25rem; }
    input {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 0.5rem;
      padding: 0.5rem 0.75rem;
      font: inherit;
    }
    input:focus { outline: 2px solid #94a3b8; outline-offset: 1px; }
    button {
      width: 100%;
      border: 0;
      border-radius: 0.5rem;
      padding: 0.6rem 0.75rem;
      font: inherit;
      font-weight: 600;
      color: #fff;
      background: #0f172a;
      cursor: pointer;
    }
    button:hover { background: #1e293b; }
    .footer { margin: 1rem 0 0; text-align: center; font-size: 0.75rem; color: #64748b; }
  </style>
</head>
<body>
  <main>
    <h1>Вход в O!task MCP</h1>
    <p class="privacy">
      Пароль не сохраняется. Токен O!task хранится только в сессии MCP; при истечении — повторный вход.
      <a href="https://github.com/grigoreo-dev/otask-mcp#readme" target="_blank" rel="noopener noreferrer">Подробнее о конфиденциальности</a>
    </p>
    ${errorHtml}
    <form method="POST" action="${escapeHtml(action)}">
      <label>
        <span>Email</span>
        <input type="email" name="email" autocomplete="username" required />
      </label>
      <label>
        <span>Пароль</span>
        <input type="password" name="password" autocomplete="current-password" required />
      </label>
      <label>
        <span>Workspace по умолчанию (slug)</span>
        <input type="text" name="default_ws" autocomplete="off" />
      </label>
      <label>
        <span>Проект по умолчанию (slug или id)</span>
        <input type="text" name="default_project" autocomplete="off" />
      </label>
      <label>
        <span>Разрешённые workspace (через запятую)</span>
        <input type="text" name="allowed_ws" autocomplete="off" />
      </label>
      <label>
        <span>Разрешённые проекты (через запятую)</span>
        <input type="text" name="allowed_projects" autocomplete="off" />
      </label>
      <button type="submit">Войти</button>
    </form>
    <p class="footer">O!task MCP — open source remote connector</p>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: opts.error ? 400 : 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
