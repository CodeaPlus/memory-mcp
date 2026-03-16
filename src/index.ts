import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import { storeMemory, storeMemorySchema,
         retrieveMemories, retrieveMemoriesSchema } from "./tools/memory.js";
import { createSession, createSessionSchema,
         endSession, endSessionSchema,
         getSessionContext, getSessionContextSchema } from "./tools/session.js";
import { storeTheory, storeTheorySchema,
         updateTheory, updateTheorySchema } from "./tools/theory.js";
import { getGoals, getGoalsSchema,
         updateGoalProgress, updateGoalProgressSchema } from "./tools/goals.js";
import { getDB } from "./db.js";

// ─── Logger ───────────────────────────────────────────────────────────────────
function log(level: "INFO" | "WARN" | "ERROR", ctx: string, msg: string, extra?: unknown) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [${ctx}] ${msg}`;
  if (extra !== undefined) {
    console.error(line, extra);
  } else {
    console.error(line);
  }
}

// ─── Tool wrapper con logs ─────────────────────────────────────────────────────
function toolHandler<T>(name: string, fn: (input: T) => Promise<unknown>) {
  return async (input: T) => {
    log("INFO", name, "llamado", input);
    try {
      const result = await fn(input);
      log("INFO", name, "OK");
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      log("ERROR", name, `ERROR: ${error.message}`, error.stack);
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

  server.tool("store_memory",
    "Almacena una memoria persistente con embedding semántico",
    storeMemorySchema.shape,
    toolHandler("store_memory", (input) => storeMemory(input as any))
  );
  server.tool("retrieve_memories",
    "Recupera memorias relevantes por similitud semántica",
    retrieveMemoriesSchema.shape,
    toolHandler("retrieve_memories", (input) => retrieveMemories(input as any))
  );
  server.tool("get_session_context",
    "Recupera contexto completo relevante para iniciar una sesión",
    getSessionContextSchema.shape,
    toolHandler("get_session_context", (input) => getSessionContext(input as any))
  );
  server.tool("create_session",
    "Crea una nueva sesión de conversación",
    createSessionSchema.shape,
    toolHandler("create_session", (input) => createSession(input as any))
  );
  server.tool("end_session",
    "Cierra sesión y persiste memorias destiladas",
    endSessionSchema.shape,
    toolHandler("end_session", (input) => endSession(input as any))
  );
  server.tool("store_theory",
    "Almacena una teoría o insight de investigación",
    storeTheorySchema.shape,
    toolHandler("store_theory", (input) => storeTheory(input as any))
  );
  server.tool("update_theory",
    "Actualiza estado o contenido de una teoría existente",
    updateTheorySchema.shape,
    toolHandler("update_theory", (input) => updateTheory(input as any))
  );
  server.tool("get_goals",
    "Obtiene objetivos y su progreso actual",
    getGoalsSchema.shape,
    toolHandler("get_goals", (input) => getGoals(input as any))
  );
  server.tool("update_goal_progress",
    "Actualiza el progreso de un objetivo",
    updateGoalProgressSchema.shape,
    toolHandler("update_goal_progress", (input) => updateGoalProgress(input as any))
  );

  return server;
}

// ─── Modo HTTP — StreamableHTTP ───────────────────────────────────────────────
async function startHTTP() {
  const PORT = parseInt(process.env.PORT ?? "3000");

  // Probe de DB al arranque para detectar problemas de conexión temprano
  log("INFO", "startup", "Verificando conexión a SurrealDB...");
  try {
    await getDB();
    log("INFO", "startup", "SurrealDB conectado OK");
  } catch (err) {
    log("ERROR", "startup", "No se pudo conectar a SurrealDB al inicio (se reintentará en el primer request)", err);
  }

  // Sessions activas: sessionId → { server, transport }
  const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const ts = new Date().toISOString();

    // Health check
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "streamable-http", sessions: sessions.size }));
      return;
    }

    if (url.pathname === "/mcp") {
      const method = req.method ?? "?";
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      log("INFO", "HTTP", `${method} /mcp | session-id: ${sessionId ?? "(sin header)"} | sessions activas: ${sessions.size}`);

      let session = sessionId ? sessions.get(sessionId) : undefined;

      if (!session) {
        // Adoptar el ID propuesto por el cliente; si no trae, generar uno nuevo.
        // Esto resuelve el caso en que Claude Code pre-genera su propio session ID.
        const assignedId = sessionId ?? randomUUID();
        log("INFO", "HTTP", `Sesión desconocida → creando con id: ${assignedId}`);

        const transport = new StreamableHTTPServerTransport({
          // Devolver el ID adoptado para que cliente y servidor queden sincronizados
          sessionIdGenerator: () => assignedId,
          onsessioninitialized: (id) => {
            log("INFO", "HTTP", `onsessioninitialized: ${id} (transport inicializado correctamente)`);
            // Belt & suspenders: actualizar el map con el id confirmado
            sessions.set(id, session!);
          },
        });

        const server = createMCPServer();
        session = { server, transport };

        // Pre-almacenar ANTES de handleRequest para que requests concurrentes
        // con el mismo session ID reutilicen el mismo transport.
        sessions.set(assignedId, session);

        transport.onerror = (err) => {
          log("ERROR", "HTTP", `Transport error (session=${assignedId}): ${err.message}`, err.stack);
        };

        transport.onclose = () => {
          log("INFO", "HTTP", `Sesión cerrada: ${assignedId}`);
          sessions.delete(assignedId);
        };

        try {
          await server.connect(transport);
          log("INFO", "HTTP", `server.connect() OK`);
        } catch (err) {
          log("ERROR", "HTTP", `server.connect() falló`, err);
          sessions.delete(assignedId);
          res.writeHead(500);
          res.end("Internal server error");
          return;
        }
      } else {
        log("INFO", "HTTP", `Sesión reutilizada: ${sessionId}`);
      }

      try {
        // Interceptar writeHead para loguear el status de la respuesta
        const origWriteHead = res.writeHead.bind(res);
        (res as any).writeHead = (statusCode: number, ...args: any[]) => {
          const lvl = statusCode >= 400 ? "WARN" : "INFO";
          log(lvl, "HTTP", `respuesta: ${statusCode}`);
          return origWriteHead(statusCode, ...args);
        };

        await session.transport.handleRequest(req, res);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log("ERROR", "HTTP", `handleRequest falló: ${error.message}`, error.stack);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal server error");
        }
      }
      return;
    }

    res.writeHead(404);
    res.end("Not found");
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
