import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";

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

    // ── POST /session/create — crea sesión nueva desde SessionStart hook ─────────
    if (url.pathname === "/session/create" && req.method === "POST") {
      try {
        const sessionResult = await createSession({ domain: "mixed" });
        const sessionId = sessionResult.session_id ?? "unknown";
        log("INFO", "POST /session/create", `Sesión creada: ${sessionId}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ session_id: sessionId }));
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log("ERROR", "POST /session/create", error.message, error.stack);
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
