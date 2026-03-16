import { Surreal, createRemoteEngines } from "surrealdb";
import { createNodeEngines } from "@surrealdb/node";

let db: Surreal | null = null;

export async function getDB(): Promise<Surreal> {
  if (db) return db;

  const url = process.env.SURREAL_URL ?? "ws://localhost:8000";
  const ns  = process.env.SURREAL_NS  ?? "personal";
  const database = process.env.SURREAL_DB ?? "memory";
  const user = process.env.SURREAL_USER ?? "root";

  console.error(`[db] Conectando a SurrealDB: ${url} (ns=${ns}, db=${database}, user=${user})`);

  db = new Surreal({
    engines: {
      ...createRemoteEngines(),
      ...createNodeEngines(),
    },
  });

  try {
    await db.connect(url, {
      namespace: ns,
      database,
      authentication: {
        username: user,
        password: process.env.SURREAL_PASS ?? "root",
      },
    });
    console.error("[db] Conexión a SurrealDB exitosa");
  } catch (err) {
    console.error("[db] ERROR al conectar a SurrealDB:", err);
    db = null;
    throw err;
  }

  return db;
}
