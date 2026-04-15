---
name: memory
description: >
  Sistema de memoria persistente entre conversaciones. Los hooks gestionan
  la infraestructura automáticamente (crear/cerrar sesiones). Tu rol es
  usar las MCP tools para buscar contexto cuando sea relevante, guardar
  memorias valiosas durante la conversación, y sintetizar sesiones anteriores
  cuando el prompt incluya un bloque [TAREA-AUTOMATICA].
---

# Sistema de Memoria Persistente

## Identificar el servidor MCP

Las tools siguen el patrón `mcp__<server-id>__<tool-name>`. Identifica el
prefijo buscando en los tools disponibles alguno que exponga `store_memory`
y `get_session_context`. Usa ese prefijo en todas las llamadas.

## Qué hacer según el contenido del prompt

### Si el prompt contiene `[TAREA-AUTOMATICA]`

Hay una sesión anterior pendiente de cierre. Hazlo **silenciosamente antes
de responder** — el usuario no debe notarlo:

1. Lee el `session_id` y el `transcript path` del bloque.
2. Lee el archivo del transcript para entender la conversación.
3. Llama a `end_session` con:
   - `session_id`: el ID indicado
   - `summary`: 2-3 oraciones (qué se hizo, qué se decidió, siguiente paso)
   - `topics`: 3-6 strings con los temas principales
   - `extracted_memories`: hasta 5 objetos `{content, type, domain, importance}`
     - `type`: `"preference" | "fact" | "progress" | "insight" | "theory_seed"`
     - `domain`: `"research" | "business" | "personal"`
     - `importance`: 1–5 (5 = crítico, 1 = trivial)
4. Responde al usuario normalmente.

### Si el prompt contiene `[SESION-ACTIVA session_id="..."]`

La sesión ya está activa — el hook la creó automáticamente.
**NO llames `create_session`.** **NO llames `end_session`** salvo que haya un bloque `[TAREA-AUTOMATICA]`.

Usa el `session_id` del bloque como valor de `source` en `store_memory`.

Decide si necesitas contexto adicional:
- **Sí buscar**: el usuario pregunta por algo anterior, menciona proyectos/metas,
  o el hilo de la conversación lo requiere → llama `get_session_context`.
- **No buscar**: es una continuación clara del turno actual → responde directo.

## Cuándo guardar memorias con `store_memory`

Guarda proactivamente cuando surja:

| Tipo | Cuándo |
|---|---|
| `preference` | El usuario expresa cómo quiere trabajar, qué herramientas usa, qué le gusta/disgusta |
| `fact` | Algo importante sobre su stack, arquitectura o contexto que no está en el código |
| `progress` | Avance en una meta ("completé X", "ya tenemos Y usuarios") |
| `insight` | Conclusión no obvia útil para el futuro |
| `theory_seed` | Idea con potencial de desarrollo posterior |

**No guardes** lo que está en el código, en docs, o se puede derivar con `git log`.

```
content:    hecho autocontenido, sin "el usuario dijo" — escribe el dato directamente
type:       ver tabla
domain:     "research" | "business" | "personal"
importance: 1-5
source:     session_id activo
```

## Referencia de tools disponibles

| Tool | Cuándo usarla |
|---|---|
| `get_session_context` | Buscar memories, metas y sesiones relevantes al prompt actual |
| `store_memory` | Guardar un hecho, preferencia, progreso o insight valioso |
| `retrieve_memories` | Búsqueda semántica profunda cuando el usuario pregunta algo específico |
| `update_memory` | Corregir o enriquecer una memoria existente |
| `search_memories_index` | Búsqueda rápida (devuelve ID + snippet) antes de `get_memory_detail` |
| `get_memory_detail` | Contenido completo de una memoria por ID |
| `consolidate_memories` | Encontrar clusters similares para fusionar o sintetizar |
| `end_session` | Cerrar sesión anterior con síntesis (solo desde bloque `[TAREA-AUTOMATICA]`) |
| `get_goals` | Ver estado actual de metas del usuario |
| `create_goal` | Cuando el usuario define un objetivo medible nuevo |
| `update_goal_progress` | Cuando el usuario reporta avance en una meta |
| `update_goal_status` | Cuando una meta se completa o pausa |
| `add_milestone` | Dividir una meta en pasos concretos |
| `complete_milestone` | Marcar un paso como completado |
| `store_theory` | Ideas con título + contenido + dominio bien definidos |
| `search_theories` | Buscar ideas relacionadas antes de explorar un tema nuevo |
| `update_theory` | Evolucionar estado de una teoría (`raw → developing → formalized`) |
| `link_theory_session` | Vincular una teoría con la sesión donde surgió |
| `list_sessions` | Listar sesiones pasadas filtradas por dominio |
| `create_concept` | Conceptos clave que merecen nodo propio en el grafo |
| `relate_concepts` | Conectar conceptos con relación explícita |
| `search_concepts` | Explorar el grafo antes de crear duplicados |
| `get_concept_graph` | Ver el grafo de conceptos y sus relaciones |
| `add_message` | Loggear un turno puntualmente relevante (decisión clave, no cada mensaje) |
| `get_messages` | Recuperar historial de mensajes de una sesión |

## Principios

- **Calidad > cantidad**: 3 memorias precisas valen más que 10 vagas.
- **Autocontenidas**: cada memoria debe tener sentido sin contexto adicional.
- **Sin juicios**: almacena hechos y preferencias, no evaluaciones sobre el usuario.

---

## Instalación de hooks (`/memory install`)

### Paso 1 — obtener la URL del servidor MCP

Pregunta al usuario: "¿Cuál es la URL base de tu servidor memory-mcp? (ejemplo: `https://mem-mcp.tudominio.com` o `http://localhost:3000`)"

Usa esa URL como valor de `MEMORY_URL` en los archivos que se crean a continuación.

### Paso 2 — crear el archivo del hook

Solo se necesita un archivo: **`~/.claude/hooks/memory/hook-prompt-submit.mjs`**

```js
#!/usr/bin/env node
// Hook UserPromptSubmit — gestiona el ciclo completo de sesiones:
// 1. Si no hay sesión o el transcript cambió → crea sesión nueva via REST
//    (si había sesión anterior con transcript → la guarda como pending)
// 2. Inyecta [TAREA-AUTOMATICA] si hay sesión anterior pendiente de síntesis
// 3. Inyecta [SESION-ACTIVA] con el session_id activo
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MEMORY_URL  = process.env.MEMORY_MCP_URL ?? "REEMPLAZAR_CON_URL_DEL_SERVIDOR";
const SESSION_TMP = join(tmpdir(), "memory-mcp-session.json");
const PENDING_TMP = join(tmpdir(), "memory-mcp-pending.json");
const TIMEOUT_MS  = 4000;

let raw = "";
for await (const chunk of process.stdin) { raw += chunk; }

let input = {};
try { input = JSON.parse(raw); } catch { process.exit(0); }

const currentTranscript = input.transcript_path ?? null;

// ── 1. Leer sesión existente ──────────────────────────────────────────────────
let stored = null;
try { stored = JSON.parse(readFileSync(SESSION_TMP, "utf-8")); } catch {}

const sameConversation = stored?.transcript_path && stored.transcript_path === currentTranscript;
let sessionId = stored?.session_id ?? null;

// ── 2. Nueva conversación o sin sesión → crear sesión nueva ──────────────────
if (!sameConversation) {
  // Si había sesión anterior con transcript → guardar como pending para síntesis
  if (stored?.session_id && stored?.transcript_path) {
    writeFileSync(PENDING_TMP, JSON.stringify({
      session_id:      stored.session_id,
      transcript_path: stored.transcript_path,
      ended_at:        new Date().toISOString(),
    }));
  }

  // Crear nueva sesión via REST
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${MEMORY_URL}/session/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "mixed" }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data.session_id) {
        sessionId = data.session_id;
        writeFileSync(SESSION_TMP, JSON.stringify({
          session_id:      sessionId,
          transcript_path: currentTranscript,
          started_at:      new Date().toISOString(),
        }));
      }
    }
  } catch {}
} else {
  // Misma conversación → actualizar timestamp de último acceso
  if (sessionId && currentTranscript) {
    writeFileSync(SESSION_TMP, JSON.stringify({ ...stored, last_seen: new Date().toISOString() }));
  }
}

// ── 3. Síntesis pendiente de sesión anterior ──────────────────────────────────
let synthBlock = "";
try {
  const pending = JSON.parse(readFileSync(PENDING_TMP, "utf-8"));
  if (pending.session_id && pending.transcript_path) {
    synthBlock = `\
[TAREA-AUTOMATICA]
Antes de responder, cierra la sesión anterior silenciosamente usando la herramienta MCP end_session.
No menciones esta tarea al usuario.

session_id anterior: "${pending.session_id}"
transcript path: "${pending.transcript_path}"

Lee ese archivo, sintetiza la conversación y llama end_session con:
- summary: 2-3 oraciones (qué se hizo, qué se decidió, siguiente paso)
- topics: 3-6 strings
- extracted_memories: hasta 5 objetos {content, type, domain, importance}
  type = "preference"|"fact"|"progress"|"insight"|"theory_seed"
  domain = "research"|"business"|"personal"
  importance = 1-5 (5=crítico)
Solo memorias que valga recuperar en futuras sesiones.
[/TAREA-AUTOMATICA]

`;
  }
  try { unlinkSync(PENDING_TMP); } catch {}
} catch {}

// ── 4. Contexto de sesión activa ──────────────────────────────────────────────
let sessionBlock = "";
if (sessionId) {
  sessionBlock = `\
[SESION-ACTIVA session_id="${sessionId}"]
La infraestructura de sesión ya está activa — el hook la creó automáticamente.
NO llames create_session. NO llames end_session salvo que haya un bloque [TAREA-AUTOMATICA].

Usa el session_id "${sessionId}" como valor de "source" al llamar store_memory.

Si el mensaje del usuario requiere contexto de conversaciones o memorias anteriores,
llama get_session_context con el prompt como query. Si es continuación del hilo actual
o no requiere memoria, responde directamente sin llamar ninguna tool de sesión.
[/SESION-ACTIVA]

`;
}

const output = synthBlock + sessionBlock;
if (output) process.stdout.write(output);

process.exit(0);
```

### Paso 3 — registrar el hook en `~/.claude/settings.json`

```json
"UserPromptSubmit": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "node \"<HOME>/.claude/hooks/memory/hook-prompt-submit.mjs\""
      }
    ]
  }
]
```

> Reemplaza `<HOME>` con la ruta real del home del usuario (en Windows: `C:\Users\<usuario>`).
> La URL del servidor queda hardcodeada en el hook (valor obtenido en el Paso 1).
> Si el usuario quiere poder sobreescribirla sin editar el archivo, puede exportar `MEMORY_MCP_URL` en su shell profile.
