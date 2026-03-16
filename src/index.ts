import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";

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

  server.registerTool("store_memory",        { description: "Almacena una memoria persistente con embedding semántico",  inputSchema: storeMemorySchema.shape        }, toolHandler("store_memory",        (i) => storeMemory(i as any)));
  server.registerTool("retrieve_memories",   { description: "Recupera memorias relevantes por similitud semántica",      inputSchema: retrieveMemoriesSchema.shape   }, toolHandler("retrieve_memories",   (i) => retrieveMemories(i as any)));
  server.registerTool("get_session_context", { description: "Recupera contexto completo relevante para iniciar sesión",  inputSchema: getSessionContextSchema.shape  }, toolHandler("get_session_context", (i) => getSessionContext(i as any)));
  server.registerTool("create_session",      { description: "Crea una nueva sesión de conversación",                     inputSchema: createSessionSchema.shape      }, toolHandler("create_session",      (i) => createSession(i as any)));
  server.registerTool("end_session",         { description: "Cierra sesión y persiste memorias destiladas",              inputSchema: endSessionSchema.shape         }, toolHandler("end_session",         (i) => endSession(i as any)));
  server.registerTool("store_theory",        { description: "Almacena una teoría o insight de investigación",            inputSchema: storeTheorySchema.shape        }, toolHandler("store_theory",        (i) => storeTheory(i as any)));
  server.registerTool("update_theory",       { description: "Actualiza estado o contenido de una teoría existente",      inputSchema: updateTheorySchema.shape       }, toolHandler("update_theory",       (i) => updateTheory(i as any)));
  server.registerTool("get_goals",           { description: "Obtiene objetivos y su progreso actual",                    inputSchema: getGoalsSchema.shape           }, toolHandler("get_goals",           (i) => getGoals(i as any)));
  server.registerTool("update_goal_progress",{ description: "Actualiza el progreso de un objetivo",                     inputSchema: updateGoalProgressSchema.shape }, toolHandler("update_goal_progress",(i) => updateGoalProgress(i as any)));

  return server;
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

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (url.pathname !== "/mcp") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    log("INFO", "HTTP", `${req.method} /mcp`);

    // Modo stateless (sessionIdGenerator: undefined):
    // Cada request recibe un transport fresco — el SDK desactiva la validación
    // de sesión y acepta GET/POST en cualquier orden sin requerir initialize primero.
    // Nuestras tools no necesitan estado en memoria (todo vive en SurrealDB),
    // así que stateless es el modo correcto para este servidor.
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

    // Loguear el status de la respuesta
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
