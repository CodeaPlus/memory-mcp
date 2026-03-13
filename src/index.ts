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

// ─── Factory ──────────────────────────────────────────────────────────────────
function createMCPServer(): McpServer {
  const server = new McpServer({
    name: "memory-mcp",
    version: "1.0.0",
  });

  server.tool("store_memory",
    "Almacena una memoria persistente con embedding semántico",
    storeMemorySchema.shape,
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await storeMemory(input as any)) }]
    })
  );

  server.tool("retrieve_memories",
    "Recupera memorias relevantes por similitud semántica",
    retrieveMemoriesSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await retrieveMemories(input as any)) }]
    })
  );

  server.tool("get_session_context",
    "Recupera contexto completo relevante para iniciar una sesión",
    getSessionContextSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await getSessionContext(input as any)) }]
    })
  );

  server.tool("create_session",
    "Crea una nueva sesión de conversación",
    createSessionSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await createSession(input as any)) }]
    })
  );

  server.tool("end_session",
    "Cierra sesión y persiste memorias destiladas",
    endSessionSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await endSession(input as any)) }]
    })
  );

  server.tool("store_theory",
    "Almacena una teoría o insight de investigación",
    storeTheorySchema.shape,
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await storeTheory(input as any)) }]
    })
  );

  server.tool("update_theory",
    "Actualiza estado o contenido de una teoría existente",
    updateTheorySchema.shape,
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await updateTheory(input as any)) }]
    })
  );

  server.tool("get_goals",
    "Obtiene objetivos y su progreso actual",
    getGoalsSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await getGoals(input as any)) }]
    })
  );

  server.tool("update_goal_progress",
    "Actualiza el progreso de un objetivo",
    updateGoalProgressSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await updateGoalProgress(input as any)) }]
    })
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

    // Health check
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "streamable-http" }));
      return;
    }

    // Único endpoint MCP
    if (url.pathname === "/mcp") {
      // Recuperar sesión existente o crear nueva
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      let session = sessionId ? sessions.get(sessionId) : undefined;

      if (!session) {
        // Nueva sesión
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            // Mover al map con el id real asignado por el transport
            sessions.set(id, session!);
          },
        });

        const server = createMCPServer();
        session = { server, transport };

        transport.onclose = () => {
          const id = transport.sessionId;
          if (id) sessions.delete(id);
        };

        await server.connect(transport);
      }

      await session.transport.handleRequest(req, res);
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
