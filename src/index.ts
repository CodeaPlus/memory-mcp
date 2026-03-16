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

// ─── Logger helper ────────────────────────────────────────────────────────────
function log(level: "INFO" | "WARN" | "ERROR", tool: string, msg: string, extra?: unknown) {
  const ts = new Date().toISOString();
  if (extra !== undefined) {
    console.error(`[${ts}] [${level}] [${tool}] ${msg}`, extra);
  } else {
    console.error(`[${ts}] [${level}] [${tool}] ${msg}`);
  }
}

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
  const server = new McpServer({
    name: "memory-mcp",
    version: "1.0.0",
  });

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

  // Sessions activas: sessionId → { server, transport }
  const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const ts = new Date().toISOString();
    console.error(`[${ts}] [HTTP] ${req.method} ${url.pathname}`);

    // Health check
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "streamable-http" }));
      return;
    }

    // Único endpoint MCP
    if (url.pathname === "/mcp") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      console.error(`[${ts}] [HTTP] mcp-session-id: ${sessionId ?? "(sin header)"}`);
      console.error(`[${ts}] [HTTP] Sessions activas en map: [${[...sessions.keys()].join(", ") || "vacío"}]`);

      let session = sessionId ? sessions.get(sessionId) : undefined;
      console.error(`[${ts}] [HTTP] Sesión encontrada en map: ${session ? "SÍ" : "NO"}`);

      if (!session) {
        console.error(`[${ts}] [HTTP] Creando nueva sesión MCP`);
        const newId = randomUUID();
        console.error(`[${ts}] [HTTP] sessionIdGenerator producirá: ${newId}`);

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => {
            console.error(`[${new Date().toISOString()}] [HTTP] sessionIdGenerator llamado → ${newId}`);
            return newId;
          },
          onsessioninitialized: (id) => {
            console.error(`[${new Date().toISOString()}] [HTTP] onsessioninitialized llamado con id=${id}, session definida=${session !== undefined}`);
            sessions.set(id, session!);
            console.error(`[${new Date().toISOString()}] [HTTP] Sessions después de guardar: [${[...sessions.keys()].join(", ")}]`);
          },
        });

        const server = createMCPServer();
        session = { server, transport };

        transport.onclose = () => {
          const id = transport.sessionId;
          console.error(`[${new Date().toISOString()}] [HTTP] Sesión cerrada: ${id}`);
          if (id) sessions.delete(id);
        };

        try {
          await server.connect(transport);
          console.error(`[${ts}] [HTTP] server.connect() completado, transport.sessionId=${transport.sessionId}`);
        } catch (err) {
          console.error(`[${new Date().toISOString()}] [HTTP] ERROR al conectar servidor MCP:`, err);
          res.writeHead(500);
          res.end("Internal server error");
          return;
        }
      }

      try {
        console.error(`[${ts}] [HTTP] Llamando handleRequest...`);
        await session.transport.handleRequest(req, res);
        console.error(`[${ts}] [HTTP] handleRequest completado`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`[${new Date().toISOString()}] [HTTP] ERROR en handleRequest: ${error.message}`, error.stack);
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
    console.error(`Memory MCP → http://0.0.0.0:${PORT}/mcp`);
  });
}

// ─── Modo stdio ───────────────────────────────────────────────────────────────
async function startStdio() {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Memory MCP stdio listo");
}

// ─── Entry point ──────────────────────────────────────────────────────────────
const mode = process.env.MCP_TRANSPORT ?? "stdio";
if (mode === "http") {
  startHTTP().catch(console.error);
} else {
  startStdio().catch(console.error);
}
