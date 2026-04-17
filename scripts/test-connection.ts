/**
 * Verifica que SurrealDB, embeddings y funciones MCP estén operativos.
 * Ejecutar después de db:setup para confirmar que todo funciona.
 */
import "dotenv/config";
import { getDB } from "../src/db.js";

async function test() {
  console.log("1. Conectando a SurrealDB...");
  const db = await getDB();
  console.log("✓ Conectado\n");

  console.log("2. Probando fn::embed...");
  const [vector] = await db.query<[number[]]>(
    `RETURN fn::embed("test de conexión")`
  );
  console.log(`✓ Embedding — dimensiones: ${vector.length}\n`);

  console.log("3. Probando fn::store_memory...");
  const [stored] = await db.query<[unknown]>(
    `RETURN fn::store_memory($content, $type, $domain, $importance, NONE)`,
    { content: "Memoria de prueba MCP", type: "fact", domain: "personal", importance: 3 }
  );
  console.log("✓ Almacenada:", JSON.stringify(stored, null, 2), "\n");

  console.log("4. Probando fn::search_memories...");
  const [results] = await db.query<[unknown[]]>(
    `RETURN fn::search_memories($query, $domain, $limit, $threshold)`,
    { query: "memoria prueba", domain: "all", limit: 3, threshold: 0.5 }
  );
  console.log("✓ Resultados:", JSON.stringify(results, null, 2), "\n");

  console.log("✓ Todo OK — MCP listo para usar");
  process.exit(0);
}

test().catch(err => {
  console.error("✗ Error:", err);
  process.exit(1);
});
