import { z } from "zod";
import { getDB } from "../db.js";

export const storeTheorySchema = z.object({
  title:   z.string(),
  content: z.string(),
  domain:  z.enum(["physics", "computing", "energy", "cross"]),
  tags:    z.array(z.string()),
});

export const updateTheorySchema = z.object({
  theory_id: z.string(),
  content:   z.string().optional(),
  status:    z.enum(["raw", "developing", "formalized", "published"]).optional(),
  tags:      z.array(z.string()).optional(),
});

export async function storeTheory(input: z.infer<typeof storeTheorySchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::store_theory($title, $content, $domain, $tags)`,
    input
  );
  return { status: "stored", record: result };
}

export async function updateTheory(input: z.infer<typeof updateTheorySchema>) {
  const db = await getDB();
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.content) fields.content = input.content;
  if (input.status)  fields.status  = input.status;
  if (input.tags)    fields.tags    = input.tags;

  await db.query(
    `UPDATE type::thing($id) MERGE $fields`,
    { id: input.theory_id, fields }
  );
  return { status: "updated" };
}

// ─── Search Theories ──────────────────────────────────────────────────────────

export const searchTheoriesSchema = z.object({
  query:  z.string().describe("Texto para buscar teorías por similitud semántica"),
  domain: z.enum(["physics", "computing", "energy", "cross", "all"]).default("all"),
  status: z.enum(["raw", "developing", "formalized", "published", "all"]).default("all"),
  limit:  z.number().default(5),
});

export const linkTheorySessionSchema = z.object({
  theory_id:  z.string().describe("ID de la teoría (ej: theory:abc123)"),
  session_id: z.string().describe("ID de la sesión de donde surgió la teoría"),
});

export async function searchTheories(input: z.infer<typeof searchTheoriesSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown[]]>(
    `RETURN fn::search_theories($query, $domain, $status, $limit)`,
    input
  );
  return result ?? [];
}

export async function linkTheorySession(input: z.infer<typeof linkTheorySessionSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::link_theory_session(type::thing($theory_id), type::thing($session_id))`,
    input
  );
  return { status: "linked", edge: result };
}
