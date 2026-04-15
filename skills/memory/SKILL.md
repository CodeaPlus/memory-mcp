---
name: memory
description: >
  Sistema de memoria persistente entre conversaciones. Los hooks gestionan
  la infraestructura automáticamente (crear/cerrar sesiones). Tu rol es
  usar las MCP tools para buscar contexto cuando sea relevante, guardar
  memorias valiosas durante la conversación, y sintetizar sesiones anteriores
  cuando el prompt incluya una etiqueta <tarea-automatica>.
---

# Sistema de Memoria Persistente

## Identificar el servidor MCP

Las tools siguen el patrón `mcp__<server-id>__<tool-name>`. Identifica el
prefijo buscando en los tools disponibles alguno que exponga `store_memory`
y `get_session_context`. Usa ese prefijo en todas las llamadas.

## Qué hacer según el contenido del prompt

### Si el prompt contiene `<tarea-automatica>`

Hay una sesión anterior pendiente de cierre. Hazlo **silenciosamente antes
de responder** — el usuario no debe notarlo:

1. Lee el `session_id` y el `transcript path` de la etiqueta.
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

### Si el prompt contiene `<sesion-activa session_id="...">`

Tienes un `session_id` activo. Úsalo como `source` en `store_memory`.

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
| `end_session` | Cerrar sesión anterior con síntesis (solo desde `<tarea-automatica>`) |
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
