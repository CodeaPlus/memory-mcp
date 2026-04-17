import { Surreal, createRemoteEngines } from "surrealdb";
import { createNodeEngines } from "@surrealdb/node";

let db: Surreal | null = null;

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

async function connectWithRetry(
  instance: Surreal,
  url: string,
  ns: string,
  database: string,
  user: string,
  pass: string
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await instance.connect(url, {
        namespace: ns,
        database,
        authentication: { username: user, password: pass },
      });
      console.error(`[db] Conexión a SurrealDB exitosa (intento ${attempt})`);
      return;
    } catch (err) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.error(`[db] Intento ${attempt}/${MAX_RETRIES} fallido. Reintentando en ${delay}ms...`, err);
      if (attempt === MAX_RETRIES) throw err;
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

export async function getDB(): Promise<Surreal> {
  if (db) return db;

  const url  = process.env.SURREAL_URL  ?? "ws://localhost:8000";
  const ns   = process.env.SURREAL_NS   ?? "personal";
  const database = process.env.SURREAL_DB ?? "memory";
  const user = process.env.SURREAL_USER ?? "root";
  const pass = process.env.SURREAL_PASS ?? "root";

  console.error(`[db] Conectando a SurrealDB: ${url} (ns=${ns}, db=${database}, user=${user})`);

  const instance = new Surreal({
    engines: {
      ...createRemoteEngines(),
      ...createNodeEngines(),
    },
  });

  try {
    await connectWithRetry(instance, url, ns, database, user, pass);
    db = instance;
  } catch (err) {
    console.error("[db] ERROR: no se pudo conectar a SurrealDB tras todos los intentos:", err);
    db = null;
    throw err;
  }

  return db;
}
