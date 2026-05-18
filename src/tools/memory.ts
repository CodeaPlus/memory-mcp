import { z } from "zod";
import { StringRecordId } from "surrealdb";
import { getDB } from "../db.js";

export const storeMemorySchema = z.object({
  content:    z.string().describe("Contenido de la memoria"),
  type:       z.enum(["preference", "fact", "progress", "insight", "theory_seed", "procedure"]),
  domain:     z.enum(["research", "business", "personal"]),
  importance: z.number().min(1).max(5).default(3),
  source:     z.string().optional().describe("ID del origen — session:xxx, theory:xxx o goal:xxx"),
  valid_from:  z.string().datetime().optional().describe("Desde cuándo es válida (ISO 8601). Default: ahora"),
  valid_until: z.string().datetime().optional().describe("Hasta cuándo es válida (ISO 8601). null = indefinida"),
  procedure_meta: z.object({
    trigger:      z.string().describe("Cuándo aplicar este procedimiento"),
    steps:        z.array(z.string()).describe("Pasos a seguir"),
    learned_from: z.string().optional().describe("Contexto de dónde se aprendió"),
  }).optional().describe("Solo para type='procedure'"),
});

export const retrieveMemoriesSchema = z.object({
  query:          z.string().describe("Texto para buscar memorias relevantes"),
  domain:         z.enum(["research", "business", "personal", "all"]).default("all"),
  limit:          z.number().default(5),
  min_similarity: z.number().default(0.70),
  as_of_date:     z.string().datetime().optional().describe("Fecha de referencia para filtro temporal (ISO 8601). Default: ahora"),
});

export const updateMemorySchema = z.object({
  memory_id:  z.string().describe("ID de la memoria a actualizar (ej: memory:abc123)"),
  content:    z.string().optional().describe("Nuevo contenido de la memoria"),
  type:       z.enum(["preference", "fact", "progress", "insight", "theory_seed", "procedure"]).optional(),
  domain:     z.enum(["research", "business", "personal"]).optional(),
  importance: z.number().min(1).max(5).optional(),
  source:     z.string().optional().describe("ID del origen — session:xxx, theory:xxx o goal:xxx"),
  valid_from:  z.string().datetime().optional().describe("Desde cuándo es válida (ISO 8601)"),
  valid_until: z.string().datetime().optional().describe("Hasta cuándo es válida (ISO 8601)"),
  procedure_meta: z.object({
    trigger:      z.string(),
    steps:        z.array(z.string()),
    learned_from: z.string().optional(),
  }).optional(),
});

export async function storeMemory(input: z.infer<typeof storeMemorySchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::store_memory($content, $type, $domain, $importance, $source, $valid_from, $valid_until, $procedure_meta)`,
    {
      content:        input.content,
      type:           input.type,
      domain:         input.domain,
      importance:     input.importance,
      source:         input.source ? new StringRecordId(input.source) : undefined,
      valid_from:     input.valid_from ? new Date(input.valid_from) : undefined,
      valid_until:    input.valid_until ? new Date(input.valid_until) : undefined,
      procedure_meta: input.procedure_meta ?? undefined,
    }
  );
  return { status: "stored", record: result };
}

export async function retrieveMemories(input: z.infer<typeof retrieveMemoriesSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown[]]>(
    `RETURN fn::search_memories($query, $domain, $limit, $threshold, $as_of)`,
    {
      query:     input.query,
      domain:    input.domain,
      limit:     input.limit,
      threshold: input.min_similarity,
      as_of:     input.as_of_date ? new Date(input.as_of_date) : undefined,
    }
  );
  return result ?? [];
}

// ─── P4: Búsqueda en 3 capas ─────────────────────────────────────────────────

export const searchMemoriesIndexSchema = z.object({
  query:          z.string().describe("Texto para buscar memorias (devuelve solo ID + snippet)"),
  domain:         z.enum(["research", "business", "personal", "all"]).default("all"),
  limit:          z.number().default(10),
  min_similarity: z.number().default(0.65),
  as_of_date:     z.string().datetime().optional().describe("Fecha de referencia para filtro temporal (ISO 8601). Default: ahora"),
});

export const getMemoryDetailSchema = z.object({
  memory_id: z.string().describe("ID de la memoria (ej: memory:abc123)"),
});

export async function searchMemoriesIndex(input: z.infer<typeof searchMemoriesIndexSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown[]]>(
    `RETURN fn::search_memories_index($query, $domain, $limit, $threshold, $as_of)`,
    {
      query:     input.query,
      domain:    input.domain,
      limit:     input.limit,
      threshold: input.min_similarity,
      as_of:     input.as_of_date ? new Date(input.as_of_date) : undefined,
    }
  );
  return result ?? [];
}

export async function getMemoryDetail(input: z.infer<typeof getMemoryDetailSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::get_memory_detail(type::record($memory_id))`,
    { memory_id: input.memory_id }
  );
  return result;
}

// ─── P3: Consolidación de memorias ───────────────────────────────────────────

export const consolidateMemoriesSchema = z.object({
  domain:         z.enum(["research", "business", "personal", "all"]).default("all"),
  min_similarity: z.number().default(0.85).describe("Umbral de similitud para considerar memorias duplicadas/solapadas"),
  limit:          z.number().default(20).describe("Máx. memorias a analizar en el cluster"),
});

export async function consolidateMemories(input: z.infer<typeof consolidateMemoriesSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown[]]>(
    `RETURN fn::consolidate_memories($domain, $threshold, $limit)`,
    {
      domain:    input.domain,
      threshold: input.min_similarity,
      limit:     input.limit,
    }
  );
  return result ?? [];
}

// ─── Temporal: invalidar memoria ─────────────────────────────────────────────

export const invalidateMemorySchema = z.object({
  memory_id:     z.string().describe("ID de la memoria a invalidar (ej: memory:abc123)"),
  replacement_id: z.string().optional().describe("ID de la memoria que la reemplaza (ej: memory:def456)"),
});

export async function invalidateMemory(input: z.infer<typeof invalidateMemorySchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::invalidate_memory($memory_id, $superseded_by)`,
    {
      memory_id:     new StringRecordId(input.memory_id),
      superseded_by: input.replacement_id ? new StringRecordId(input.replacement_id) : undefined,
    }
  );
  return { status: "invalidated", record: result };
}

// ─── Decay: memorias obsoletas ──────────────────────────────────────────────

export const getStaleMemoriesSchema = z.object({
  domain:         z.enum(["research", "business", "personal", "all"]).default("all"),
  days_threshold: z.number().default(30).describe("Días sin acceso para considerar obsoleta"),
  limit:          z.number().default(20),
});

export async function getStaleMemories(input: z.infer<typeof getStaleMemoriesSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown[]]>(
    `RETURN fn::get_stale_memories($domain, $days_threshold, $limit)`,
    {
      domain:         input.domain,
      days_threshold: input.days_threshold,
      limit:          input.limit,
    }
  );
  return result ?? [];
}

// ─── Procedural memory ──────────────────────────────────────────────────────

export const storeProcedureSchema = z.object({
  content:    z.string().describe("Descripción del procedimiento"),
  domain:     z.enum(["research", "business", "personal"]),
  importance: z.number().min(1).max(5).default(3),
  trigger:    z.string().describe("Cuándo aplicar este procedimiento"),
  steps:      z.array(z.string()).describe("Pasos a seguir"),
  learned_from: z.string().optional().describe("Contexto de dónde se aprendió"),
  source:     z.string().optional().describe("ID del origen — session:xxx"),
});

export async function storeProcedure(input: z.infer<typeof storeProcedureSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::store_memory($content, $type, $domain, $importance, $source, $valid_from, $valid_until, $procedure_meta)`,
    {
      content:        input.content,
      type:           "procedure",
      domain:         input.domain,
      importance:     input.importance,
      source:         input.source ? new StringRecordId(input.source) : undefined,
      valid_from:     undefined,
      valid_until:    undefined,
      procedure_meta: {
        trigger:      input.trigger,
        steps:        input.steps,
        learned_from: input.learned_from,
      },
    }
  );
  return { status: "stored", record: result };
}

export const getProceduresSchema = z.object({
  query:  z.string().describe("Texto para buscar procedimientos relevantes"),
  domain: z.enum(["research", "business", "personal", "all"]).default("all"),
  limit:  z.number().default(5),
});

export async function getProcedures(input: z.infer<typeof getProceduresSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown[]]>(
    `RETURN fn::get_active_procedures($query, $domain, $limit)`,
    {
      query:  input.query,
      domain: input.domain,
      limit:  input.limit,
    }
  );
  return result ?? [];
}

// ─── Update memory ──────────────────────────────────────────────────────────

export async function updateMemory(input: z.infer<typeof updateMemorySchema>) {
  const db = await getDB();
  const data: Record<string, unknown> = {};
  if (input.content        !== undefined) data.content        = input.content;
  if (input.type           !== undefined) data.type           = input.type;
  if (input.domain         !== undefined) data.domain         = input.domain;
  if (input.importance     !== undefined) data.importance     = input.importance;
  if (input.source         !== undefined) data.source         = new StringRecordId(input.source);
  if (input.valid_from     !== undefined) data.valid_from     = new Date(input.valid_from);
  if (input.valid_until    !== undefined) data.valid_until    = new Date(input.valid_until);
  if (input.procedure_meta !== undefined) data.procedure_meta = input.procedure_meta;

  const [result] = await db.query<[unknown]>(
    `RETURN fn::update_memory($memory_id, $data)`,
    {
      memory_id: new StringRecordId(input.memory_id),
      data,
    }
  );
  return { status: "updated", record: result };
}
