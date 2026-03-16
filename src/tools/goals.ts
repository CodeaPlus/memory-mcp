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

// ─── Create Goal ──────────────────────────────────────────────────────────────

export const createGoalSchema = z.object({
  title:       z.string(),
  description: z.string(),
  type:        z.enum(["financial", "research", "product"]),
  target:      z.number(),
  current:     z.number().default(0),
  unit:        z.string().describe("Unidad de medida: 'USD/month', 'papers', etc."),
  deadline:    z.string().optional().describe("ISO datetime opcional"),
});

export const addMilestoneSchema = z.object({
  goal_id:     z.string().describe("ID del goal (ej: goal:abc123)"),
  title:       z.string(),
  description: z.string().optional(),
  order:       z.number().int().describe("Posición del milestone dentro del goal"),
});

export const completeMilestoneSchema = z.object({
  milestone_id: z.string().describe("ID del milestone (ej: milestone:abc123)"),
});

export const updateGoalStatusSchema = z.object({
  goal_id: z.string().describe("ID del goal"),
  status:  z.enum(["active", "completed"]),
});

export async function createGoal(input: z.infer<typeof createGoalSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::create_goal($title, $description, $type, $target, $current, $unit, $deadline)`,
    input
  );
  return { status: "created", record: result };
}

export async function addMilestone(input: z.infer<typeof addMilestoneSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::add_milestone(type::thing($goal_id), $title, $description, $order)`,
    input
  );
  return { status: "created", record: result };
}

export async function completeMilestone(input: z.infer<typeof completeMilestoneSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::complete_milestone(type::thing($milestone_id))`,
    input
  );
  return { status: "completed", record: result };
}

export async function updateGoalStatus(input: z.infer<typeof updateGoalStatusSchema>) {
  const db = await getDB();
  const [result] = await db.query<[unknown]>(
    `RETURN fn::update_goal_status(type::thing($goal_id), $status)`,
    input
  );
  return { status: "updated", record: result };
}
