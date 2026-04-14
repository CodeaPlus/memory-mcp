import { z } from "zod";
import { getDB } from "../db.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const createConceptSchema = z.object({
  name:        z.string().describe("Nombre corto del concepto"),
  description: z.string().describe("Descripción del concepto"),
  domain:      z.enum(["research", "business", "personal"]),
  importance:  z.number().min(1).max(5).default(3),
});

export const relateConceptsSchema = z.object({
  from_id:     z.string().describe("ID del concepto origen (ej: concept:abc123)"),
  to_id:       z.string().describe("ID del concepto destino"),
  strength:    z.number().min(0).max(1).default(1.0).describe("Fuerza de la relación 0-1"),
  confidence:  z.enum(["explicit", "inferred", "ambiguous"]).default("explicit")
                .describe("explicit = dicho directamente; inferred = deducido por contexto; ambiguous = dudoso"),
  description: z.string().optional().describe("Descripción de la relación"),
});

export const searchConceptsSchema = z.object({
  query:  z.string().describe("Texto para buscar conceptos relevantes"),
  domain: z.enum(["research", "business", "personal", "all"]).default("all"),
  limit:  z.number().default(10),
});

export const getConceptGraphSchema = z.object({
  concept_id: z.string().describe("ID del concepto (ej: concept:abc123)"),
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function createConcept(input: z.infer<typeof createConceptSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::create_concept($name, $description, $domain, $importance)`,
    input
  );
  return { status: "created", record: result };
}

export async function relateConcepts(input: z.infer<typeof relateConceptsSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::relate_concepts(
      type::record($from_id),
      type::record($to_id),
      $strength,
      $confidence,
      $description
    )`,
    input
  );
  return { status: "related", edge: result };
}

export async function searchConcepts(input: z.infer<typeof searchConceptsSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown[]]>(
    `RETURN fn::search_concepts($query, $domain, $limit)`,
    input
  );
  return result ?? [];
}

export async function getConceptGraph(input: z.infer<typeof getConceptGraphSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::get_concept_graph(type::record($concept_id))`,
    input
  );
  return result;
}
