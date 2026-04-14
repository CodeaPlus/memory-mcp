import { z } from "zod";
import { Table, StringRecordId } from "surrealdb";
import { getDB } from "../db.js";
import { storeMemory } from "./memory.js";

export const createSessionSchema = z.object({
  domain: z.enum(["research", "business", "mixed"]),
  initial_topic: z.string().optional(),
});

export const endSessionSchema = z.object({
  session_id:         z.string(),
  summary:            z.string(),
  topics:             z.array(z.string()),
  investigated:       z.array(z.string()).optional().describe("Temas investigados o explorados en esta sesión"),
  learned:            z.array(z.string()).optional().describe("Aprendizajes o descubrimientos concretos"),
  completed:          z.array(z.string()).optional().describe("Tareas o decisiones completadas"),
  next_steps:         z.array(z.string()).optional().describe("Próximos pasos o pendientes sugeridos"),
  extracted_memories: z.array(z.object({
    content:    z.string(),
    type:       z.enum(["preference", "fact", "progress", "insight", "theory_seed"]),
    domain:     z.enum(["research", "business", "personal"]),
    importance: z.number().min(1).max(5),
  })),
});

export const getSessionContextSchema = z.object({
  query: z.string(),
});

export async function createSession(
  input: z.infer<typeof createSessionSchema>
) {
  const db = await getDB();
  // v2: create() requiere Table class
  const result = await db.create(new Table("session")).content({
    domain: input.domain,
    summary: "",
    topics: [],
  });
  const record = Array.isArray(result) ? (result as any[])[0] : result;
  return { session_id: (record as any).id?.toString() };
}

export async function endSession(
  input: z.infer<typeof endSessionSchema>
) {
  const db = await getDB();

  // v3: update() requiere RecordId, no string
  const sessionPatch: Record<string, unknown> = {
    summary: input.summary,
    topics:  input.topics,
  };
  if (input.investigated) sessionPatch.investigated = input.investigated;
  if (input.learned)      sessionPatch.learned      = input.learned;
  if (input.completed)    sessionPatch.completed    = input.completed;
  if (input.next_steps)   sessionPatch.next_steps   = input.next_steps;

  await db.update(new StringRecordId(input.session_id)).merge(sessionPatch);

  await Promise.all(
    input.extracted_memories.map(m => storeMemory(m))
  );

  return {
    status: "closed",
    memories_stored: input.extracted_memories.length,
  };
}

export async function getSessionContext(
  input: z.infer<typeof getSessionContextSchema>
) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::get_session_context($query)`,
    { query: input.query }
  );
  return result;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export const addMessageSchema = z.object({
  session_id: z.string().describe("ID de la sesión"),
  role:       z.enum(["user", "assistant"]),
  content:    z.string(),
});

export const getMessagesSchema = z.object({
  session_id: z.string().describe("ID de la sesión"),
  limit:      z.number().default(50),
});

export const listSessionsSchema = z.object({
  domain: z.enum(["research", "business", "mixed", "all"]).default("all"),
  limit:  z.number().default(10),
});

export async function addMessage(input: z.infer<typeof addMessageSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::add_message(type::record($session_id), $role, $content)`,
    input
  );
  return { status: "added", record: result };
}

export async function getMessages(input: z.infer<typeof getMessagesSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown[]]>(
    `RETURN fn::get_messages(type::record($session_id), $limit)`,
    input
  );
  return result ?? [];
}

export async function listSessions(input: z.infer<typeof listSessionsSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown[]]>(
    `RETURN fn::list_sessions($domain, $limit)`,
    input
  );
  return result ?? [];
}
