#!/usr/bin/env node
/**
 * Hook: Stop
 *
 * Se dispara cuando el LLM termina de responder. Lee el transcript desde
 * el path provisto por Claude Code y llama POST /session/auto-end al
 * servidor memory-mcp para cerrar la sesión activa.
 *
 * Configurar en ~/.claude/settings.json:
 *   "hooks": {
 *     "Stop": [{
 *       "hooks": [{ "type": "command", "command": "node /ruta/hook-stop.mjs" }]
 *     }]
 *   }
 */

import { readFileSync } from "node:fs";

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

// Extraer resumen y temas del transcript para la sesión
let summary = "";
let topics = [];

if (input.transcript_path) {
  try {
    const transcript = JSON.parse(readFileSync(input.transcript_path, "utf-8"));
    const messages = Array.isArray(transcript) ? transcript : transcript?.messages ?? [];

    // Últimas 3 interacciones para armar el resumen
    const recent = messages.slice(-6);
    const userMsgs = recent
      .filter((m) => m.role === "user")
      .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)).slice(0, 200));

    if (userMsgs.length > 0) {
      summary = `Conversación: ${userMsgs.join(" | ").slice(0, 400)}`;
      // Palabras clave como topics (primeras 5 palabras significativas de cada msg)
      topics = [...new Set(
        userMsgs
          .join(" ")
          .split(/\s+/)
          .filter((w) => w.length > 4)
          .slice(0, 8)
      )];
    }
  } catch {
    // transcript no legible — usa fallback
  }
}

if (!summary) {
  summary = `Conversación automática (${new Date().toLocaleDateString("es")})`;
}

try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  await fetch(`${MEMORY_URL}/session/auto-end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary, topics }),
    signal: controller.signal,
  });
  clearTimeout(timer);
} catch {
  // Servidor no disponible — ok, continúa sin error
}

process.exit(0);
