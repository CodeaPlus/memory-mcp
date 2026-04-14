#!/usr/bin/env node
/**
 * Hook: UserPromptSubmit
 *
 * Lee el prompt del usuario via stdin, consulta GET /context al servidor
 * memory-mcp y escribe el contexto de memoria en stdout para que el LLM
 * lo reciba antes de procesar el mensaje.
 *
 * Configurar en ~/.claude/settings.json:
 *   "hooks": {
 *     "UserPromptSubmit": [{
 *       "hooks": [{ "type": "command", "command": "node /ruta/hook-prompt-submit.mjs" }]
 *     }]
 *   }
 */

const MEMORY_URL = process.env.MEMORY_MCP_URL ?? "http://localhost:3000";
const TIMEOUT_MS = 3000;

let raw = "";
for await (const chunk of process.stdin) {
  raw += chunk;
}

let input = {};
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const query = typeof input.prompt === "string"
  ? input.prompt.slice(0, 500)
  : "contexto general";

try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const res = await fetch(
    `${MEMORY_URL}/context?q=${encodeURIComponent(query)}`,
    { signal: controller.signal }
  );
  clearTimeout(timer);

  if (res.ok) {
    const data = await res.json();
    if (data.context) {
      process.stdout.write(data.context);
    }
  }
} catch {
  // Servidor no disponible — continúa sin memoria, sin ruido
}

process.exit(0);
