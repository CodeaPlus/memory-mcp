/**
 * Script de migración de embeddings
 *
 * Regenera todos los embeddings de SurrealDB con el nuevo servicio de embeddings.
 * Ejecutar después de cambiar el modelo (fastembed → Infinity/jina-clip-v2 u otro).
 *
 * Uso:
 *   npx tsx scripts/migrate-embeddings.ts [--dry-run] [--table memory,theory,concept,message]
 *
 * Requiere:
 *   - SurrealDB corriendo con las variables de entorno configuradas
 *   - Nuevo servicio de embeddings corriendo (EMBED_URL)
 *   - TANTO el servicio viejo como el nuevo pueden estar apagados
 *     (el script llama directamente al nuevo servicio HTTP, no a SurrealDB fn::embed)
 */

import "dotenv/config";
import Surreal, { StringRecordId } from "surrealdb";

// ─── Config ───────────────────────────────────────────────────────────────────

const SURREAL_URL  = process.env.SURREAL_URL  ?? "ws://localhost:8000";
const SURREAL_NS   = process.env.SURREAL_NS   ?? "personal";
const SURREAL_DB   = process.env.SURREAL_DB   ?? "memory";
const SURREAL_USER = process.env.SURREAL_USER ?? "root";
const SURREAL_PASS = process.env.SURREAL_PASS ?? "root";

// URL del servicio gemini-embed (interfaz fastembed-compatible)
// En local apunta al puerto expuesto del contenedor; en Docker, al nombre del servicio.
const EMBED_URL = process.env.EMBED_URL ?? "http://localhost:8000/embeddings";

const BATCH_SIZE = 20;  // registros por lote
const DRY_RUN    = process.argv.includes("--dry-run");

const TARGET_TABLES_ARG = process.argv.find((a) => a.startsWith("--table="))?.split("=")[1];
const TARGET_TABLES: string[] = TARGET_TABLES_ARG
  ? TARGET_TABLES_ARG.split(",")
  : ["memory", "theory", "concept", "message"];

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RecordWithEmbedding {
  id: any;
  [key: string]: any;
}

/** Obtiene el texto a embeber según la tabla */
function getTextForTable(table: string, record: RecordWithEmbedding): string | null {
  switch (table) {
    case "memory":  return record.content ?? null;
    case "message": return record.content ?? null;
    case "theory":  return record.title && record.content
                      ? `${record.title} ${record.content}`
                      : record.content ?? null;
    case "concept": return record.name && record.description
                      ? `${record.name}: ${record.description}`
                      : record.name ?? null;
    default:        return null;
  }
}

// ─── Embedding ────────────────────────────────────────────────────────────────

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts: [text] }),
  });
  if (!res.ok) throw new Error(`Embed HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json() as any;
  const embedding = data?.embeddings?.[0];
  if (!Array.isArray(embedding)) throw new Error("Respuesta de embedding inválida");
  return embedding;
}

// ─── Migración ────────────────────────────────────────────────────────────────

async function migrateTable(db: Surreal, table: string): Promise<void> {
  console.log(`\n── Tabla: ${table} ──────────────────────────`);

  let offset = 0;
  let total = 0;
  let errors = 0;

  while (true) {
    const records = await db.query<[RecordWithEmbedding[]]>(
      `SELECT * FROM type::table($table) LIMIT $limit START $offset`,
      { table, limit: BATCH_SIZE, offset }
    ).then(([r]) => r ?? []);

    if (records.length === 0) break;

    for (const record of records) {
      const text = getTextForTable(table, record);
      if (!text) {
        console.log(`  SKIP ${record.id} — sin texto extraíble`);
        continue;
      }

      try {
        if (DRY_RUN) {
          console.log(`  DRY  ${record.id} (${text.slice(0, 60)}...)`);
        } else {
          const embedding = await embedText(text);
          await db.query(
            `UPDATE type::record($id) SET embedding = $embedding`,
            { id: record.id.toString(), embedding }
          );
          console.log(`  OK   ${record.id} [${embedding.length} dims]`);
        }
        total++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ERR  ${record.id}: ${msg}`);
        errors++;
      }
    }

    offset += records.length;
    if (records.length < BATCH_SIZE) break;
  }

  console.log(`  → ${total} migrados, ${errors} errores`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log("── MODO DRY RUN — no se modificará nada ──\n");

  console.log(`Servicio: ${EMBED_URL}`);
  console.log(`Tablas:   ${TARGET_TABLES.join(", ")}\n`);

  // Verificar que el servicio de embeddings esté disponible
  console.log("Verificando servicio de embeddings...");
  try {
    await embedText("test");
    console.log("Servicio de embeddings OK\n");
  } catch (err) {
    console.error(`Error: servicio de embeddings no disponible en ${EMBED_URL}`);
    console.error(err);
    process.exit(1);
  }

  // Conectar a SurrealDB
  const db = new Surreal();
  await db.connect(SURREAL_URL);
  await db.use({ namespace: SURREAL_NS, database: SURREAL_DB });
  await db.signin({ username: SURREAL_USER, password: SURREAL_PASS });
  console.log("SurrealDB conectado\n");

  for (const table of TARGET_TABLES) {
    await migrateTable(db, table);
  }

  await db.close();
  console.log("\n✓ Migración completada");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
