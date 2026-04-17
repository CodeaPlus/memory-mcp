/**
 * Aplica schema.surql y functions.surql a SurrealDB.
 * Ejecutar una sola vez después de levantar la base de datos.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Surreal, createRemoteEngines } from "surrealdb";
import { createNodeEngines } from "@surrealdb/node";

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC   = join(__dir, "../src/db");

const url  = process.env.SURREAL_URL  ?? "ws://localhost:8001";
const ns   = process.env.SURREAL_NS   ?? "personal";
const db   = process.env.SURREAL_DB   ?? "memory";
const user = process.env.SURREAL_USER ?? "root";
const pass = process.env.SURREAL_PASS ?? "root";

async function run() {
  console.log(`Conectando a SurrealDB: ${url}`);
  const conn = new Surreal({ engines: { ...createRemoteEngines(), ...createNodeEngines() } });

  await conn.connect(url, {
    namespace: ns,
    database: db,
    authentication: { username: user, password: pass },
  });
  console.log("✓ Conectado\n");

  for (const file of ["schema.surql", "functions.surql"]) {
    const sql = readFileSync(join(SRC, file), "utf-8");
    console.log(`Aplicando ${file}...`);
    await conn.query(sql);
    console.log(`✓ ${file} aplicado\n`);
  }

  console.log("✓ Base de datos configurada correctamente");
  await conn.close();
  process.exit(0);
}

run().catch(err => {
  console.error("✗ Error:", err.message);
  process.exit(1);
});
