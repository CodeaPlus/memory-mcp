import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { storeMemory, storeMemorySchema,
         retrieveMemories, retrieveMemoriesSchema,
         updateMemory, updateMemorySchema,
         searchMemoriesIndex, searchMemoriesIndexSchema,
         getMemoryDetail, getMemoryDetailSchema,
         consolidateMemories, consolidateMemoriesSchema } from "./tools/memory.js";
import { createSession, createSessionSchema,
         endSession, endSessionSchema,
         getSessionContext, getSessionContextSchema,
         addMessage, addMessageSchema,
         getMessages, getMessagesSchema,
         listSessions, listSessionsSchema } from "./tools/session.js";
import { storeTheory, storeTheorySchema,
         updateTheory, updateTheorySchema,
         searchTheories, searchTheoriesSchema,
         linkTheorySession, linkTheorySessionSchema } from "./tools/theory.js";
import { getGoals, getGoalsSchema,
         updateGoalProgress, updateGoalProgressSchema,
         createGoal, createGoalSchema,
         addMilestone, addMilestoneSchema,
         completeMilestone, completeMilestoneSchema,
         updateGoalStatus, updateGoalStatusSchema } from "./tools/goals.js";
import { createConcept, createConceptSchema,
         relateConcepts, relateConceptsSchema,
         searchConcepts, searchConceptsSchema,
         getConceptGraph, getConceptGraphSchema } from "./tools/concepts.js";
import { getDB } from "./db.js";

// ─── Temp file para session activa entre hooks ────────────────────────────────
const SESSION_TMP = join(tmpdir(), "memory-mcp-session.json");

// ─── Logger ───────────────────────────────────────────────────────────────────
function log(level: "INFO" | "WARN" | "ERROR", ctx: string, msg: string, extra?: unknown) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [${ctx}] ${msg}`;
  extra !== undefined ? console.error(line, extra) : console.error(line);
}

// ─── Tool wrapper ──────────────────────────────────────────────────────────────
function toolHandler<T>(name: string, fn: (input: T) => Promise<unknown>) {
  return async (input: T) => {
    log("INFO", name, "llamado", input);
    try {
      const result = await fn(input);
      log("INFO", name, "OK");
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      log("ERROR", name, error.message, error.stack);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: error.message }) }],
        isError: true,
      };
    }
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────
function createMCPServer(): McpServer {
  const server = new McpServer({ name: "memory-mcp", version: "1.0.0" });

  // ── Memory ────────────────────────────────────────────────────────────────
  server.registerTool("store_memory",           { description: "Almacena una memoria persistente con embedding semántico",                                       inputSchema: storeMemorySchema.shape           }, toolHandler("store_memory",           (i) => storeMemory(i as any)));
  server.registerTool("retrieve_memories",      { description: "Recupera memorias relevantes por similitud semántica (contenido completo)",                    inputSchema: retrieveMemoriesSchema.shape      }, toolHandler("retrieve_memories",      (i) => retrieveMemories(i as any)));
  server.registerTool("update_memory",          { description: "Actualiza contenido, tipo, dominio, importancia o fuente de una memoria existente",            inputSchema: updateMemorySchema.shape          }, toolHandler("update_memory",          (i) => updateMemory(i as any)));
  server.registerTool("search_memories_index",  { description: "Búsqueda rápida de memorias: devuelve ID + snippet + score. Úsala antes de get_memory_detail", inputSchema: searchMemoriesIndexSchema.shape   }, toolHandler("search_memories_index",  (i) => searchMemoriesIndex(i as any)));
  server.registerTool("get_memory_detail",      { description: "Obtiene el contenido completo de una memoria por ID (capa 2 de búsqueda)",                     inputSchema: getMemoryDetailSchema.shape       }, toolHandler("get_memory_detail",      (i) => getMemoryDetail(i as any)));
  server.registerTool("consolidate_memories",   { description: "Encuentra clusters de memorias similares para que el LLM las sintetice o fusione",             inputSchema: consolidateMemoriesSchema.shape   }, toolHandler("consolidate_memories",   (i) => consolidateMemories(i as any)));

  // ── Session ───────────────────────────────────────────────────────────────
  server.registerTool("create_session",      { description: "Crea una nueva sesión de conversación",                     inputSchema: createSessionSchema.shape      }, toolHandler("create_session",      (i) => createSession(i as any)));
  server.registerTool("end_session",         { description: "Cierra sesión y persiste memorias destiladas",              inputSchema: endSessionSchema.shape         }, toolHandler("end_session",         (i) => endSession(i as any)));
  server.registerTool("get_session_context", { description: "Recupera contexto completo relevante para iniciar sesión",  inputSchema: getSessionContextSchema.shape  }, toolHandler("get_session_context", (i) => getSessionContext(i as any)));
  server.registerTool("list_sessions",       { description: "Lista sesiones pasadas filtradas por dominio",              inputSchema: listSessionsSchema.shape       }, toolHandler("list_sessions",       (i) => listSessions(i as any)));
  server.registerTool("add_message",         { description: "Agrega un mensaje (user/assistant) a una sesión",          inputSchema: addMessageSchema.shape         }, toolHandler("add_message",         (i) => addMessage(i as any)));
  server.registerTool("get_messages",        { description: "Recupera el historial de mensajes de una sesión",          inputSchema: getMessagesSchema.shape        }, toolHandler("get_messages",        (i) => getMessages(i as any)));

  // ── Theory ────────────────────────────────────────────────────────────────
  server.registerTool("store_theory",        { description: "Almacena una teoría o insight de investigación",            inputSchema: storeTheorySchema.shape        }, toolHandler("store_theory",        (i) => storeTheory(i as any)));
  server.registerTool("update_theory",       { description: "Actualiza estado o contenido de una teoría existente",      inputSchema: updateTheorySchema.shape       }, toolHandler("update_theory",       (i) => updateTheory(i as any)));
  server.registerTool("search_theories",     { description: "Busca teorías por similitud semántica",                     inputSchema: searchTheoriesSchema.shape     }, toolHandler("search_theories",     (i) => searchTheories(i as any)));
  server.registerTool("link_theory_session", { description: "Vincula una teoría a la sesión de donde surgió",           inputSchema: linkTheorySessionSchema.shape  }, toolHandler("link_theory_session", (i) => linkTheorySession(i as any)));

  // ── Goals ─────────────────────────────────────────────────────────────────
  server.registerTool("get_goals",            { description: "Obtiene objetivos y su progreso actual",                   inputSchema: getGoalsSchema.shape            }, toolHandler("get_goals",            (i) => getGoals(i as any)));
  server.registerTool("create_goal",          { description: "Crea un nuevo objetivo con métricas y deadline",          inputSchema: createGoalSchema.shape          }, toolHandler("create_goal",          (i) => createGoal(i as any)));
  server.registerTool("update_goal_progress", { description: "Actualiza el progreso numérico de un objetivo",           inputSchema: updateGoalProgressSchema.shape  }, toolHandler("update_goal_progress", (i) => updateGoalProgress(i as any)));
  server.registerTool("update_goal_status",   { description: "Cambia el status de un objetivo (active/completed)",      inputSchema: updateGoalStatusSchema.shape    }, toolHandler("update_goal_status",   (i) => updateGoalStatus(i as any)));
  server.registerTool("add_milestone",        { description: "Agrega un milestone a un objetivo",                       inputSchema: addMilestoneSchema.shape        }, toolHandler("add_milestone",        (i) => addMilestone(i as any)));
  server.registerTool("complete_milestone",   { description: "Marca un milestone como completado",                      inputSchema: completeMilestoneSchema.shape   }, toolHandler("complete_milestone",   (i) => completeMilestone(i as any)));

  // ── Concepts ──────────────────────────────────────────────────────────────
  server.registerTool("create_concept",       { description: "Crea un concepto en el grafo de conocimiento",            inputSchema: createConceptSchema.shape       }, toolHandler("create_concept",       (i) => createConcept(i as any)));
  server.registerTool("relate_concepts",      { description: "Crea una relación entre dos conceptos del grafo",         inputSchema: relateConceptsSchema.shape      }, toolHandler("relate_concepts",      (i) => relateConcepts(i as any)));
  server.registerTool("search_concepts",      { description: "Busca conceptos por similitud semántica",                 inputSchema: searchConceptsSchema.shape      }, toolHandler("search_concepts",      (i) => searchConcepts(i as any)));
  server.registerTool("get_concept_graph",    { description: "Obtiene un concepto y todas sus relaciones",              inputSchema: getConceptGraphSchema.shape     }, toolHandler("get_concept_graph",    (i) => getConceptGraph(i as any)));

  return server;
}

// ─── Helpers para endpoints REST ─────────────────────────────────────────────

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

function formatContextForInjection(ctx: any, sessionId: string): string {
  const date = new Date().toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
  const lines: string[] = [
    `\n--- MEMORIA ACTIVA (${date}) ---`,
    `Sesión: ${sessionId}\n`,
  ];

  if (ctx?.memories?.length) {
    lines.push("Memorias relevantes:");
    for (const m of ctx.memories) {
      lines.push(`- [${m.type}/${m.importance}] ${m.content}`);
    }
    lines.push("");
  }

  if (ctx?.goals?.length) {
    lines.push("Metas activas:");
    for (const g of ctx.goals) {
      lines.push(`- ${g.title} (${g.current ?? 0}/${g.target} ${g.unit ?? ""})`);
    }
    lines.push("");
  }

  if (ctx?.theories?.length) {
    lines.push("Teorías en desarrollo:");
    for (const t of ctx.theories) {
      lines.push(`- [${t.status}] ${t.title}`);
    }
    lines.push("");
  }

  if (Array.isArray(ctx?.last_session) && ctx.last_session.length > 0) {
    const last = ctx.last_session[0] as any;
    if (last?.summary) {
      const snippet = last.summary.length > 300 ? last.summary.slice(0, 300) + "..." : last.summary;
      lines.push(`Última sesión: ${snippet}`);
      if (last.completed?.length)   lines.push(`  ✓ Completado: ${last.completed.join("; ")}`);
      if (last.learned?.length)     lines.push(`  → Aprendido: ${last.learned.join("; ")}`);
      if (last.next_steps?.length)  lines.push(`  ⏭ Pendiente: ${last.next_steps.join("; ")}`);
      lines.push("");
    }
  }

  lines.push("--- FIN MEMORIA ---\n");
  return lines.join("\n");
}

// ─── Modo HTTP ────────────────────────────────────────────────────────────────
async function startHTTP() {
  const PORT = parseInt(process.env.PORT ?? "3000");

  log("INFO", "startup", "Verificando conexión a SurrealDB...");
  try {
    await getDB();
    log("INFO", "startup", "SurrealDB conectado OK");
  } catch (err) {
    log("ERROR", "startup", "No se pudo conectar a SurrealDB al inicio", err);
  }

  // SSE legacy: mapa de transports activos por sessionId
  const sseSessions = new Map<string, SSEServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // ── GET /context?q=<query> — carga contexto y crea sesión automáticamente ─
    if (url.pathname === "/context" && req.method === "GET") {
      const query = url.searchParams.get("q") ?? "contexto general";
      try {
        const [contextResult, sessionResult] = await Promise.all([
          getSessionContext({ query }),
          createSession({ domain: "mixed" }),
        ]);
        const sessionId = sessionResult.session_id ?? "unknown";
        try {
          writeFileSync(SESSION_TMP, JSON.stringify({ session_id: sessionId, started_at: new Date().toISOString() }));
        } catch {}
        const formatted = formatContextForInjection(contextResult, sessionId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ context: formatted, session_id: sessionId, raw: contextResult }));
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log("ERROR", "GET /context", error.message, error.stack);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // ── POST /session/auto-end — cierra sesión activa desde hook Stop ─────────
    if (url.pathname === "/session/auto-end" && req.method === "POST") {
      let sessionId: string | null = null;
      try {
        const stored = JSON.parse(readFileSync(SESSION_TMP, "utf-8"));
        sessionId = stored.session_id ?? null;
      } catch {}

      if (!sessionId) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No hay sesión activa" }));
        return;
      }

      try {
        const body = await readBody(req);
        const summary = typeof body.summary === "string" && body.summary.trim()
          ? body.summary
          : `Conversación automática (${new Date().toLocaleDateString("es")})`;
        const topics = Array.isArray(body.topics) ? body.topics as string[] : [];

        await endSession({ session_id: sessionId, summary, topics, extracted_memories: [] });
        try { unlinkSync(SESSION_TMP); } catch {}
        log("INFO", "POST /session/auto-end", `Sesión ${sessionId} cerrada`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "closed", session_id: sessionId }));
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log("ERROR", "POST /session/auto-end", error.message, error.stack);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // ── SSE legacy: GET /sse abre el stream ──────────────────────────────────
    if (url.pathname === "/sse" && req.method === "GET") {
      log("INFO", "SSE", "cliente conectado");
      const transport = new SSEServerTransport("/messages", res);
      sseSessions.set(transport.sessionId, transport);
      res.on("close", () => {
        sseSessions.delete(transport.sessionId);
        log("INFO", "SSE", `sesión ${transport.sessionId} cerrada`);
      });
      const server = createMCPServer();
      await server.connect(transport);
      return;
    }

    // ── SSE legacy: POST /messages envía mensajes ────────────────────────────
    if (url.pathname === "/messages" && req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId") ?? "";
      const transport = sseSessions.get(sessionId);
      if (!transport) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Sesión SSE no encontrada: ${sessionId}` }));
        return;
      }
      await transport.handlePostMessage(req, res);
      return;
    }

    // ── StreamableHTTP: POST /mcp ────────────────────────────────────────────
    if (url.pathname !== "/mcp") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    log("INFO", "HTTP", `${req.method} /mcp`);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    transport.onerror = (err) => log("ERROR", "HTTP", `Transport: ${err.message}`, err.stack);

    const server = createMCPServer();

    try {
      await server.connect(transport);
    } catch (err) {
      log("ERROR", "HTTP", "server.connect() falló", err);
      res.writeHead(500);
      res.end("Internal server error");
      return;
    }

    const origWriteHead = res.writeHead.bind(res);
    (res as any).writeHead = (statusCode: number, ...args: any[]) => {
      log(statusCode >= 400 ? "WARN" : "INFO", "HTTP", `respuesta: ${statusCode}`);
      return origWriteHead(statusCode, ...args);
    };

    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log("ERROR", "HTTP", `handleRequest: ${error.message}`, error.stack);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal server error");
      }
    }
  });

  httpServer.listen(PORT, () => {
    log("INFO", "HTTP", `Memory MCP escuchando en http://0.0.0.0:${PORT}/mcp`);
  });
}

// ─── Modo stdio ───────────────────────────────────────────────────────────────
async function startStdio() {
  log("INFO", "startup", "Verificando conexión a SurrealDB...");
  try {
    await getDB();
    log("INFO", "startup", "SurrealDB conectado OK");
  } catch (err) {
    log("ERROR", "startup", "No se pudo conectar a SurrealDB al inicio", err);
  }

  const server = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("INFO", "stdio", "Memory MCP stdio listo");
}

// ─── Entry point ──────────────────────────────────────────────────────────────
const mode = process.env.MCP_TRANSPORT ?? "stdio";
if (mode === "http") {
  startHTTP().catch((err) => log("ERROR", "startup", "startHTTP falló", err));
} else {
  startStdio().catch((err) => log("ERROR", "startup", "startStdio falló", err));
}
