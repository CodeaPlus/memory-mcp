import { z } from "zod";
import { getDB } from "../db.js";

export const storeMemorySchema = z.object({
  content:    z.string().describe("Contenido de la memoria"),
  type:       z.enum(["preference", "fact", "progress", "insight", "theory_seed"]),
  domain:     z.enum(["research", "business", "personal"]),
  importance: z.number().min(1).max(5).default(3),
});

export const retrieveMemoriesSchema = z.object({
  query:          z.string().describe("Texto para buscar memorias relevantes"),
  domain:         z.enum(["research", "business", "personal", "all"]).default("all"),
  limit:          z.number().default(5),
  min_similarity: z.number().default(0.70),
});

export async function storeMemory(input: z.infer<typeof storeMemorySchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::store_memory($content, $type, $domain, $importance)`,
    {
      content:    input.content,
      type:       input.type,
      domain:     input.domain,
      importance: input.importance,
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
