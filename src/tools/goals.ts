import { z } from "zod";
import { Table } from "surrealdb";
import { getDB } from "../db.js";

export const getGoalsSchema = z.object({
  status: z.enum(["active", "completed", "all"]).default("active"),
});

export const updateGoalProgressSchema = z.object({
  goal_id: z.string(),
  current: z.number(),
  note: z.string().optional(),
});

export async function getGoals(input: z.infer<typeof getGoalsSchema>) {
  const db = await getDB();
  const filter = input.status === "all" ? "" : `WHERE status = '${input.status}'`;
  const [result] = await db.query<[unknown[]]>(`
    SELECT *, (
      SELECT title, completed, order FROM milestone
      WHERE goal_id = $parent.id ORDER BY order ASC
    ) AS milestones FROM goal ${filter}
  `);
  return result ?? [];
}

export async function updateGoalProgress(
  input: z.infer<typeof updateGoalProgressSchema>
) {
  const db = await getDB();

  // v2: update con .merge()
  await db.update(input.goal_id as any).merge({ current: input.current });

  if (input.note) {
    await db.query(
      `RETURN fn::store_memory($note, 'progress', 'business', 4)`,
      { note: input.note }
    );
  }

  return { status: "updated" };
}
