const PAGE_STYLES = `
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
    .disclaimer { margin: 0 0 1rem; font-size: 0.8rem; color: #64748b; line-height: 1.45; }
    .error { color: #b91c1c; margin: 0 0 1rem; font-size: 0.875rem; }
    .warn { color: #b45309; margin: 0 0 0.5rem; font-size: 0.8rem; }
    .helper { margin: 0 0 0.75rem; font-size: 0.8rem; color: #64748b; line-height: 1.4; }
    form { display: flex; flex-direction: column; gap: 0.75rem; }
    label { display: block; font-size: 0.875rem; }
    label span { display: block; font-weight: 500; margin-bottom: 0.25rem; }
    input, select {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 0.5rem;
      padding: 0.5rem 0.75rem;
      font: inherit;
      background: #fff;
    }
    select[multiple] { min-height: 6rem; }
    input:focus, select:focus { outline: 2px solid #94a3b8; outline-offset: 1px; }
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
`;

function shell(opts: {
  title: string;
  heading: string;
  body: string;
  error?: string;
  status: number;
}): Response {
  const errorHtml = opts.error ? `<p class="error" role="alert">${escapeHtml(opts.error)}</p>` : "";

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
  <style>
${PAGE_STYLES}
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(opts.heading)}</h1>
    ${errorHtml}
    ${opts.body}
    <p class="footer">O!task MCP — open source remote connector</p>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: opts.status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** Step 1 — credentials only (email + password). Scope selects live on step 2. */
export function renderLoginStep1(opts: { query: string; error?: string }): Response {
  const action = `/authorize?${opts.query}`;
  const body = `
    <p class="privacy">
      Пароль не сохраняется. Токен O!task хранится только в сессии MCP; при истечении — повторный вход.
      <a href="https://github.com/grigoreo-dev/otask-mcp#readme" target="_blank" rel="noopener noreferrer">Подробнее о конфиденциальности</a>
    </p>
    <p class="disclaimer">
      Неофициальный коннектор. Не аффилирован с O!task.
    </p>
    <form method="POST" action="${escapeHtml(action)}">
      <label>
        <span>Email</span>
        <input type="email" name="email" autocomplete="username" required />
      </label>
      <label>
        <span>Пароль</span>
        <input type="password" name="password" autocomplete="current-password" required />
      </label>
      <button type="submit">Далее</button>
    </form>`;

  return shell({
    title: "Вход — O!task MCP",
    heading: "Вход в O!task MCP",
    body,
    error: opts.error,
    status: opts.error ? 400 : 200,
  });
}

export type LoginTeamOption = { slug: string; name: string };
export type LoginProjectOption = { id: number; slug: string; name: string };
export type LoginProjectsByWs = {
  ws: string;
  projects: LoginProjectOption[];
  error?: string | null;
};

/** Step 2 — scope picks (пространства / проекты) after successful credentials. */
export function renderLoginStep2(opts: {
  query: string;
  error?: string;
  teams: LoginTeamOption[];
  projectsByWs: LoginProjectsByWs[];
  defaultTeamSlug?: string;
  warnings?: string[];
}): Response {
  const action = `/authorize?${opts.query}`;
  const teamNameBySlug = new Map(opts.teams.map((t) => [t.slug, t.name]));

  const defaultWsOptions = opts.teams
    .map((t) => {
      const selected = opts.defaultTeamSlug === t.slug ? " selected" : "";
      return `<option value="${escapeHtml(t.slug)}"${selected}>${escapeHtml(t.name)}</option>`;
    })
    .join("\n        ");

  const allowedWsOptions = opts.teams
    .map((t) => `<option value="${escapeHtml(t.slug)}">${escapeHtml(t.name)}</option>`)
    .join("\n        ");

  const defaultProjectOptions = [
    `<option value="">— не выбран —</option>`,
    ...opts.projectsByWs.flatMap((entry) => {
      const teamLabel = teamNameBySlug.get(entry.ws) ?? entry.ws;
      const optsHtml = entry.projects
        .map((p) => {
          const value = `${entry.ws}::${p.slug}`;
          return `<option value="${escapeHtml(value)}">${escapeHtml(p.name)}</option>`;
        })
        .join("\n          ");
      if (!optsHtml) return [];
      return [
        `<optgroup label="${escapeHtml(teamLabel)}">\n          ${optsHtml}\n        </optgroup>`,
      ];
    }),
  ].join("\n        ");

  const allowedProjectOptions = opts.projectsByWs
    .flatMap((entry) =>
      entry.projects.map((p) => {
        const value = `${entry.ws}::${p.slug}`;
        const teamLabel = teamNameBySlug.get(entry.ws) ?? entry.ws;
        return `<option value="${escapeHtml(value)}">${escapeHtml(teamLabel)} / ${escapeHtml(p.name)}</option>`;
      })
    )
    .join("\n        ");

  const projectLoadWarnings = opts.projectsByWs
    .filter((entry) => entry.error)
    .map((entry) => {
      const teamLabel = teamNameBySlug.get(entry.ws) ?? entry.ws;
      return `<p class="warn" role="status">Не удалось загрузить проекты для пространства «${escapeHtml(teamLabel)}» (${escapeHtml(entry.ws)}): ${escapeHtml(String(entry.error))}</p>`;
    })
    .join("\n    ");

  const extraWarnings = (opts.warnings ?? [])
    .map((w) => `<p class="warn" role="status">${escapeHtml(w)}</p>`)
    .join("\n    ");

  const body = `
    <p class="privacy">
      Выберите пространства и проекты для этой сессии MCP.
    </p>
    <p class="disclaimer">
      Неофициальный коннектор. Не аффилирован с O!task.
    </p>
    <p class="helper">Не выбрано = доступ ко всем пространствам/проектам аккаунта.</p>
    ${projectLoadWarnings}
    ${extraWarnings}
    <form method="POST" action="${escapeHtml(action)}">
      <input type="hidden" name="step" value="2" />
      <label>
        <span>Пространство по умолчанию</span>
        <select name="default_ws" required>
        ${defaultWsOptions}
        </select>
      </label>
      <label>
        <span>Проект по умолчанию (необязательно)</span>
        <select name="default_project">
        ${defaultProjectOptions}
        </select>
      </label>
      <label>
        <span>Разрешённые пространства</span>
        <select name="allowed_ws" multiple>
        ${allowedWsOptions}
        </select>
      </label>
      <label>
        <span>Разрешённые проекты</span>
        <select name="allowed_projects" multiple>
        ${allowedProjectOptions}
        </select>
      </label>
      <button type="submit">Войти</button>
    </form>`;

  return shell({
    title: "Области — O!task MCP",
    heading: "Выбор пространств",
    body,
    error: opts.error,
    status: opts.error ? 400 : 200,
  });
}

/**
 * @deprecated Prefer renderLoginStep1 / renderLoginStep2. Kept as alias of step1
 * for any leftover callers until Task 5b rewires AuthHandler.
 */
export function renderLoginPage(opts: { query: string; error?: string }): Response {
  return renderLoginStep1(opts);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
