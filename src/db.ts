import { Surreal, createRemoteEngines } from "surrealdb";
import { createNodeEngines } from "@surrealdb/node";

let db: Surreal | null = null;

export async function getDB(): Promise<Surreal> {
  if (db) return db;

  db = new Surreal({
    engines: {
      ...createRemoteEngines(),
      ...createNodeEngines(),
    },
  });

  await db.connect(process.env.SURREAL_URL ?? "ws://localhost:8000", {
    namespace: process.env.SURREAL_NS ?? "personal",
    database:  process.env.SURREAL_DB  ?? "memory",
    authentication: {
      username: process.env.SURREAL_USER ?? "root",
      password: process.env.SURREAL_PASS ?? "root",
    },
  });

  return db;
}
