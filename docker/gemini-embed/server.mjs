/**
 * gemini-embed — wrapper HTTP compatible con la interfaz de fastembed
 *
 * Expone POST /embeddings { texts: string[] } → { embeddings: number[][] }
 * usando la API de Gemini Embedding 2 (batchEmbedContents).
 *
 * Variables de entorno:
 *   GEMINI_API_KEY    — requerido
 *   GEMINI_MODEL      — default: gemini-embedding-2-preview
 *   EMBED_DIMENSIONS  — default: 1536  (opciones: 128–3072, Matryoshka)
 *   PORT              — default: 8000
 *   MAX_BATCH_SIZE    — default: 100   (límite de la API de Gemini)
 */

import { createServer } from "node:http";

const API_KEY    = process.env.GEMINI_API_KEY;
const MODEL      = process.env.GEMINI_MODEL      ?? "gemini-embedding-2-preview";
const DIMENSIONS = parseInt(process.env.EMBED_DIMENSIONS ?? "1536");
const PORT       = parseInt(process.env.PORT            ?? "8000");
const MAX_BATCH  = parseInt(process.env.MAX_BATCH_SIZE  ?? "100");

if (!API_KEY) {
  console.error("[gemini-embed] ERROR: GEMINI_API_KEY no configurado");
  process.exit(1);
}

const BATCH_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;

// ─── Retry con backoff exponencial ────────────────────────────────────────────

async function fetchWithRetry(url, options, retries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, options);

    if (res.ok) return res;

    // Rate limit o error temporal — reintentar
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const wait = delayMs * 2 ** (attempt - 1);
      console.warn(`[gemini-embed] HTTP ${res.status}, reintento ${attempt}/${retries} en ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    // Error no recuperable
    const body = await res.text();
    throw new Error(`Gemini API HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
}

// ─── Embedding por lote ───────────────────────────────────────────────────────

async function embedBatch(texts) {
  const requests = texts.map((text) => ({
    model: `models/${MODEL}`,
    content: { parts: [{ text: String(text) }] },
    outputDimensionality: DIMENSIONS,
  }));

  const res = await fetchWithRetry(BATCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": API_KEY,
    },
    body: JSON.stringify({ requests }),
  });

  const data = await res.json();

  if (!Array.isArray(data?.embeddings)) {
    throw new Error(`Respuesta inesperada de Gemini: ${JSON.stringify(data).slice(0, 200)}`);
  }

  return data.embeddings.map((e) => e.values);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ─── Servidor ─────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // Health check
  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { status: "ok", model: MODEL, dimensions: DIMENSIONS });
  }

  // POST /embeddings — interfaz compatible con fastembed
  if (req.method === "POST" && url.pathname === "/embeddings") {
    let texts;
    try {
      const body = JSON.parse(await readBody(req));
      texts = body.texts;
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error("texts debe ser un array no vacío");
      }
      if (texts.length > MAX_BATCH) {
        throw new Error(`Máximo ${MAX_BATCH} textos por request (recibidos: ${texts.length})`);
      }
    } catch (err) {
      return json(res, 400, { error: err.message });
    }

    try {
      const embeddings = await embedBatch(texts);
      return json(res, 200, { embeddings });
    } catch (err) {
      console.error("[gemini-embed] Error:", err.message);
      return json(res, 500, { error: err.message });
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`[gemini-embed] Corriendo en :${PORT} | modelo=${MODEL} | dims=${DIMENSIONS}`);
});
