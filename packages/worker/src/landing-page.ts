export function renderLanding(opts: { origin: string }): Response {
  const origin = escapeHtml(opts.origin);
  const mcpUrl = escapeHtml(`${opts.origin}/mcp`);
  const githubUrl = "https://github.com/grigoreo-dev/otask-mcp";

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>O!task MCP — remote connector</title>
  <link rel="icon" type="image/png" href="/icon.png" />
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
      max-width: 32rem;
      background: #fff;
      border-radius: 0.75rem;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
      padding: 1.75rem;
    }
    h1 { margin: 0 0 0.75rem; font-size: 1.35rem; font-weight: 600; }
    p { margin: 0 0 0.85rem; font-size: 0.95rem; color: #334155; line-height: 1.5; }
    .connect {
      margin: 1rem 0;
      padding: 0.85rem 1rem;
      background: #f1f5f9;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      word-break: break-all;
    }
    .connect code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.85rem;
      color: #0f172a;
    }
    a { color: #2563eb; }
    .disclaimer {
      margin: 1.25rem 0 0;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
      font-size: 0.8rem;
      color: #64748b;
      line-height: 1.45;
    }
    .footer { margin: 1rem 0 0; text-align: center; font-size: 0.75rem; color: #94a3b8; }
  </style>
</head>
<body>
  <main>
    <h1>O!task MCP</h1>
    <p>
      Неофициальный open-source remote MCP-коннектор к API O!task.
      Подключайте агентов и IDE (Cursor, Claude Desktop и др.) к задачам, проектам и пространствам.
    </p>
    <p>URL для подключения MCP-клиента:</p>
    <div class="connect">
      <code>${mcpUrl}</code>
    </div>
    <p>
      OAuth-вход выполняется через этот сервис. Исходный код:
      <a href="${githubUrl}" target="_blank" rel="noopener noreferrer">github.com/grigoreo-dev/otask-mcp</a>
    </p>
    <p class="disclaimer">
      Неофициальный open-source коннектор. Не аффилирован с O!task.
      Не является продуктом и не поддерживается компанией O!task.
      Origin: ${origin}
    </p>
    <p class="footer">O!task MCP — open source remote connector</p>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
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
