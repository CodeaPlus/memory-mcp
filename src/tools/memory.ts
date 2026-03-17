import { z } from "zod";
import { StringRecordId } from "surrealdb";
import { getDB } from "../db.js";

export const storeMemorySchema = z.object({
  content:    z.string().describe("Contenido de la memoria"),
  type:       z.enum(["preference", "fact", "progress", "insight", "theory_seed"]),
  domain:     z.enum(["research", "business", "personal"]),
  importance: z.number().min(1).max(5).default(3),
  source:     z.string().optional().describe("ID del origen — session:xxx, theory:xxx o goal:xxx"),
});

export const retrieveMemoriesSchema = z.object({
  query:          z.string().describe("Texto para buscar memorias relevantes"),
  domain:         z.enum(["research", "business", "personal", "all"]).default("all"),
  limit:          z.number().default(5),
  min_similarity: z.number().default(0.70),
});

export const updateMemorySchema = z.object({
  memory_id:  z.string().describe("ID de la memoria a actualizar (ej: memory:abc123)"),
  content:    z.string().optional().describe("Nuevo contenido de la memoria"),
  type:       z.enum(["preference", "fact", "progress", "insight", "theory_seed"]).optional(),
  domain:     z.enum(["research", "business", "personal"]).optional(),
  importance: z.number().min(1).max(5).optional(),
  source:     z.string().optional().describe("ID del origen — session:xxx, theory:xxx o goal:xxx"),
});

export async function storeMemory(input: z.infer<typeof storeMemorySchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::store_memory($content, $type, $domain, $importance, $source)`,
    {
      content:    input.content,
      type:       input.type,
      domain:     input.domain,
      importance: input.importance,
      source:     input.source ? new StringRecordId(input.source) : null,
    }
  );
  return { status: "stored", record: result };
}

export async function retrieveMemories(input: z.infer<typeof retrieveMemoriesSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown[]]>(
    `RETURN fn::search_memories($query, $domain, $limit, $threshold)`,
    {
      query:     input.query,
      domain:    input.domain,
      limit:     input.limit,
      threshold: input.min_similarity,
    }
  );
  return result ?? [];
}

export async function updateMemory(input: z.infer<typeof updateMemorySchema>) {
  const db = await getDB();
  const data: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.content    !== undefined) data.content    = input.content;
  if (input.type       !== undefined) data.type       = input.type;
  if (input.domain     !== undefined) data.domain     = input.domain;
  if (input.importance !== undefined) data.importance = input.importance;
  if (input.source     !== undefined) data.source     = new StringRecordId(input.source);

  const [result] = await db.query<[unknown]>(
    `RETURN fn::update_memory($memory_id, $data)`,
    {
      memory_id: new StringRecordId(input.memory_id),
      data,
    }
  );
  return { status: "updated", record: result };
}
