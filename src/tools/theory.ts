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
