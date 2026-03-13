import { z } from "zod";
import { Table } from "surrealdb";
import { getDB } from "../db.js";
import { storeMemory } from "./memory.js";

export const createSessionSchema = z.object({
  domain: z.enum(["research", "business", "mixed"]),
  initial_topic: z.string().optional(),
});

export const endSessionSchema = z.object({
  session_id: z.string(),
  summary: z.string(),
  topics: z.array(z.string()),
  extracted_memories: z.array(z.object({
    content: z.string(),
    type: z.enum(["preference", "fact", "progress", "insight", "theory_seed"]),
    domain: z.enum(["research", "business", "personal"]),
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
    created_at: new Date().toISOString(),
  });
  return { session_id: (result as any).id?.toString() };
}

export async function endSession(
  input: z.infer<typeof endSessionSchema>
) {
  const db = await getDB();

  // v2: update() usa builder pattern con .merge()
  await db.update(input.session_id as any)
    .merge({
      summary: input.summary,
      topics: input.topics,
    });

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
