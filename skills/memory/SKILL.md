---
name: memory
description: >
  Sistema de memoria persistente entre conversaciones. SIEMPRE usa este skill al comienzo
  de cualquier conversación para cargar contexto relevante del usuario (metas, proyectos,
  preferencias, historial). SIEMPRE úsalo también al finalizar para guardar lo aprendido.
  Durante la conversación, almacena proactivamente insights, decisiones, preferencias y
  progreso. Úsalo cuando el usuario mencione proyectos anteriores, pida recordar algo,
  trabaje en metas de largo plazo, o cuando cualquier información valga la pena persistir
  para futuras sesiones.
---

# Sistema de Memoria Persistente

Este skill usa el servidor MCP de memoria para mantener continuidad entre conversaciones.
El objetivo es que nunca pierdas el hilo de lo que el usuario está construyendo,
aprendiendo o persiguiendo.

## Identificar los tools del MCP

Los tools de este skill siguen el patrón `mcp__<server-id>__<tool-name>` o puede ser úbicado con el nombre de `memoria`. 
El `server-id` varía según el cliente y la instalación. Al inicio de la conversación, identifica el
servidor correcto buscando en los tools disponibles uno que exponga `store_memory`,
`retrieve_memories` y `get_session_context`. Usa el prefijo de ese servidor para todas
las llamadas de este skill.

## Al inicio de cada conversación

Tan pronto el usuario envíe su primer mensaje:

1. **Detecta si el hook ya cargó el contexto.** Busca en el prompt un bloque
   `--- MEMORIA ACTIVA ---` con una línea `Sesión: <id>`. Si existe:
   - Extrae el `session_id` de esa línea y guárdalo — no llames a `create_session`.
   - El contexto (memorias, metas, teorías, última sesión) ya está inyectado;
     úsalo silenciosamente sin repetirlo.

2. **Si el bloque NO está presente** (hook desactivado o servidor caído):
   - Llama a `get_session_context` con el tema inicial como `query`. Devuelve:
     - `memories`: recuerdos relevantes
     - `goals`: metas activas con su progreso
     - `theories`: ideas en desarrollo
     - `last_session`: resumen de la última sesión, con `completed`, `learned` y
       `next_steps` si fueron registrados
   - Llama a `create_session` para obtener un `session_id` y guárdalo.

## Durante la conversación

Almacena activamente información valiosa para el futuro con `store_memory` cuando:

- El usuario expresa una **preferencia** sobre cómo trabaja, qué herramientas usa, cómo
  quiere las respuestas, o qué patrones le gustan/disgustan.
- Se establece un **hecho** importante sobre su stack técnico, arquitectura, o contexto
  de negocio que no está en el código.
- Hay **progreso** en una meta (ej: "completé el módulo X", "ya tenemos Y usuarios").
- Surge un **insight** — una conclusión no obvia que podría ser útil más adelante.
- Se planta una semilla de **teoría** o idea que merece desarrollo posterior.

### Parámetros para store_memory

```
content:    descripción clara y autocontenida (sin "el usuario dijo", escribe el hecho directamente)
type:       "preference" | "fact" | "progress" | "insight" | "theory_seed"
domain:     "research" | "business" | "personal"
importance: 1–5 (5 = crítico, 3 = normal, 1 = trivial)
source:     el session_id de esta sesión (ej: "session:abc123")
```

**Guía de importancia:**
- 5: Decisión arquitectónica, meta crítica, preferencia fuerte del usuario
- 4: Información de contexto clave, progreso significativo
- 3: Hecho útil, preferencia moderada
- 2: Dato de apoyo, detalle menor
- 1: Observación trivial

### Cuándo NO almacenar

No guardes cosas que ya están en el código, en la documentación del proyecto, o que
se pueden derivar trivialmente con git log / grep. La memoria es para conocimiento
contextual y humano que no está en ningún otro lugar.

## Herramientas adicionales disponibles

Úsalas cuando el contexto lo justifique:

| Herramienta | Cuándo usarla |
|---|---|
| `retrieve_memories` | Cuando el usuario pregunta por algo específico que puede estar en memoria (devuelve contenido completo) |
| `search_memories_index` | Búsqueda rápida y liviana: devuelve ID + snippet de 120 chars + score. Úsala primero para escanear sin consumir tokens |
| `get_memory_detail` | Obtiene el contenido completo de una memoria por ID. Úsala después de `search_memories_index` solo para las relevantes |
| `consolidate_memories` | Encuentra clusters de memorias muy similares entre sí. Úsala periódicamente para identificar duplicados o candidatas a fusionar |
| `update_memory` | Para corregir o enriquecer una memoria existente |
| `get_goals` | Para mostrar el estado actual de las metas del usuario |
| `create_goal` | Cuando el usuario define un objetivo medible nuevo |
| `update_goal_progress` | Cuando el usuario reporta avance en una meta |
| `update_goal_status` | Cuando una meta se completa o pausa |
| `add_milestone` | Para dividir una meta en pasos concretos |
| `complete_milestone` | Cuando un paso se marca como completado |
| `add_message` | Para loggear un turno puntual especialmente relevante: una decisión clave, una instrucción precisa, o una respuesta que resuelve algo no trivial. No logges cada mensaje — solo los que valga recuperar semánticamente después. Pasa el `session_id` activo. |
| `get_messages` | Para recuperar el historial de mensajes de una sesión específica |
| `store_theory` | Para ideas con estructura suficiente (título + contenido + dominio) |
| `search_theories` | Para buscar ideas relacionadas antes de explorar un tema nuevo |
| `update_theory` | Para evolucionar el estado de una teoría (raw → developing → formalized) |
| `create_concept` | Para conceptos clave que merecen su propio nodo en el grafo |
| `relate_concepts` | Para conectar conceptos. Usa `confidence: "explicit"` si fue dicho directamente, `"inferred"` si lo dedujiste del contexto, `"ambiguous"` si hay duda |
| `search_concepts` | Para explorar el grafo antes de crear conceptos duplicados |

## Al finalizar la conversación

Cuando la conversación llega a un punto de cierre natural (el usuario se despide, dice
"gracias", o la tarea principal quedó resuelta):

1. Llama a `end_session` con:
   - `session_id`: el ID guardado al inicio
   - `summary`: 2-4 oraciones que capturen qué se hizo, qué se decidió y cuál es el
     siguiente paso lógico
   - `topics`: array de 3-6 strings con los temas principales tocados
   - `domain`: el dominio predominante ("research" | "business" | "personal")
   - `investigated`: (opcional) temas o preguntas que se exploraron en esta sesión
   - `learned`: (opcional) aprendizajes o descubrimientos concretos
   - `completed`: (opcional) tareas, decisiones o pasos que quedaron resueltos
   - `next_steps`: (opcional) pendientes o próximas acciones sugeridas

   Rellena los campos opcionales siempre que haya algo concreto que decir — son los
   que aparecerán destacados en el contexto de la próxima sesión.

2. No menciones que cerraste la sesión a menos que el usuario lo pregunte.

## Principios generales

- **Calidad sobre cantidad**: prefiere 3 memorias precisas a 10 vagas.
- **Autocontenidas**: cada memoria debe tener sentido sin contexto adicional.
- **Sin juicios negativos**: almacena hechos y preferencias, no evaluaciones sobre el usuario.
- **No duplicar lo obvio**: si está en el README o en el código, no lo memorices.

---

## Comando: /memory install

Cuando el usuario diga `/memory install`, `instalar memoria`, `configurar hooks` o similar,
ejecuta los siguientes pasos **sin pedir confirmación** usando tus herramientas directamente.

### Paso 1 — Detectar rutas y URL del servidor

Determina el directorio home del usuario:
- **Windows**: `C:\Users\<usuario>` — obtenerlo con Bash: `echo %USERPROFILE%`
- **Mac/Linux**: `~` — obtenerlo con Bash: `echo $HOME`

Las rutas destino son:
- Hooks: `<HOME>/.claude/hooks/memory/`
- Settings: `<HOME>/.claude/settings.json`

**Pregunta al usuario la URL pública del servidor memory-mcp** antes de continuar:

> ¿Cuál es la URL donde está corriendo el servidor memory-mcp?
> (ej: `https://memory.tudominio.com`, `http://192.168.1.10:3000`, o `http://localhost:3000` si es local)

Guarda esa URL como `<MEMORY_URL>` — la usarás en el Paso 2 para escribirla directamente en los hooks.

### Paso 2 — Escribir los hooks

Crea el directorio `<HOME>/.claude/hooks/memory/` si no existe y escribe estos dos archivos:

**Archivo: `hook-prompt-submit.mjs`**

Sustituye `<MEMORY_URL>` con la URL obtenida en el Paso 1.

```javascript
#!/usr/bin/env node
const MEMORY_URL = process.env.MEMORY_MCP_URL ?? "<MEMORY_URL>";
const TIMEOUT_MS = 3000;

let raw = "";
for await (const chunk of process.stdin) { raw += chunk; }

let input = {};
try { input = JSON.parse(raw); } catch { process.exit(0); }

const query = typeof input.prompt === "string"
  ? input.prompt.slice(0, 500)
  : "contexto general";

try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const res = await fetch(
    `${MEMORY_URL}/context?q=${encodeURIComponent(query)}`,
    { signal: controller.signal }
  );
  clearTimeout(timer);
  if (res.ok) {
    const data = await res.json();
    if (data.context) process.stdout.write(data.context);
  }
} catch {}

process.exit(0);
```

**Archivo: `hook-stop.mjs`**

Sustituye `<MEMORY_URL>` con la URL obtenida en el Paso 1.

```javascript
#!/usr/bin/env node
import { readFileSync } from "node:fs";

const MEMORY_URL = process.env.MEMORY_MCP_URL ?? "<MEMORY_URL>";
const TIMEOUT_MS = 3000;

let raw = "";
for await (const chunk of process.stdin) { raw += chunk; }

let input = {};
try { input = JSON.parse(raw); } catch { process.exit(0); }

let summary = "";
let topics = [];

if (input.transcript_path) {
  try {
    const transcript = JSON.parse(readFileSync(input.transcript_path, "utf-8"));
    const messages = Array.isArray(transcript) ? transcript : transcript?.messages ?? [];
    const recent = messages.slice(-6);
    const userMsgs = recent
      .filter((m) => m.role === "user")
      .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)).slice(0, 200));
    if (userMsgs.length > 0) {
      summary = `Conversación: ${userMsgs.join(" | ").slice(0, 400)}`;
      topics = [...new Set(userMsgs.join(" ").split(/\s+/).filter((w) => w.length > 4).slice(0, 8))];
    }
  } catch {}
}

if (!summary) summary = `Conversación automática (${new Date().toLocaleDateString("es")})`;

try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  await fetch(`${MEMORY_URL}/session/auto-end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary, topics }),
    signal: controller.signal,
  });
  clearTimeout(timer);
} catch {}

process.exit(0);
```

### Paso 3 — Registrar los hooks en settings.json

Lee `<HOME>/.claude/settings.json` (si no existe, usa `{}`). Mergea sin pisar configuración
existente. El resultado debe incluir:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [{ "type": "command", "command": "node <HOME>/.claude/skills/memory/hooks/hook-prompt-submit.mjs" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "node <HOME>/.claude/skills/memory/hooks/hook-stop.mjs" }]
      }
    ]
  }
}
```

Reemplaza `<HOME>` con la ruta absoluta detectada en el Paso 1. En Windows usa barras invertidas dobles (`\\`) dentro del JSON.

### Paso 4 — Confirmar

Responde al usuario con un resumen de lo que se instaló:
- Paths de los archivos creados
- La URL del servidor que quedó configurada en los hooks
- Que debe **reiniciar Claude Code** para que los hooks surtan efecto
- Que `MEMORY_MCP_URL` como variable de entorno del sistema tiene precedencia sobre la URL escrita en los hooks (útil si cambia el servidor sin reinstalar)
