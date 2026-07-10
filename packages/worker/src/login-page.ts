export function renderLoginPage(opts: {
  query: string;
  error?: string;
}): Response {
  const action = `/authorize?${opts.query}`;
  const errorHtml = opts.error
    ? `<p class="error" role="alert">${escapeHtml(opts.error)}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Вход — O!task MCP</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; }
    .error { color: #b91c1c; margin-bottom: 1rem; }
  </style>
</head>
<body class="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4">
  <main class="w-full max-w-md bg-white shadow-md rounded-xl p-6 space-y-4">
    <h1 class="text-xl font-semibold">Вход в O!task MCP</h1>
    <p class="text-sm text-slate-600">
      Пароль не сохраняется. Токен O!task хранится только в сессии MCP; при истечении — повторный вход.
      <a class="text-blue-600 underline" href="https://github.com/grigoreo-dev/otask-mcp#readme" target="_blank" rel="noopener noreferrer">Подробнее о конфиденциальности</a>
    </p>
    ${errorHtml}
    <form method="POST" action="${escapeHtml(action)}" class="space-y-3">
      <label class="block text-sm">
        <span class="font-medium">Email</span>
        <input class="mt-1 w-full border rounded-lg px-3 py-2" type="email" name="email" autocomplete="username" required />
      </label>
      <label class="block text-sm">
        <span class="font-medium">Пароль</span>
        <input class="mt-1 w-full border rounded-lg px-3 py-2" type="password" name="password" autocomplete="current-password" required />
      </label>
      <label class="block text-sm">
        <span class="font-medium">Workspace по умолчанию (slug)</span>
        <input class="mt-1 w-full border rounded-lg px-3 py-2" type="text" name="default_ws" autocomplete="off" />
      </label>
      <label class="block text-sm">
        <span class="font-medium">Проект по умолчанию (slug или id)</span>
        <input class="mt-1 w-full border rounded-lg px-3 py-2" type="text" name="default_project" autocomplete="off" />
      </label>
      <label class="block text-sm">
        <span class="font-medium">Разрешённые workspace (через запятую)</span>
        <input class="mt-1 w-full border rounded-lg px-3 py-2" type="text" name="allowed_ws" autocomplete="off" />
      </label>
      <label class="block text-sm">
        <span class="font-medium">Разрешённые проекты (через запятую)</span>
        <input class="mt-1 w-full border rounded-lg px-3 py-2" type="text" name="allowed_projects" autocomplete="off" />
      </label>
      <button type="submit" class="w-full bg-slate-900 text-white rounded-lg py-2 font-medium hover:bg-slate-800">
        Войти
      </button>
    </form>
    <p class="text-xs text-slate-500 text-center">O!task MCP — open source remote connector</p>
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
