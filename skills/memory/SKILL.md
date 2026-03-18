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

1. Llama a `get_session_context` pasando el tema o pregunta inicial como `query`.
   Devuelve:
   - `memories`: recuerdos relevantes (preferencias, hechos, progreso, insights)
   - `goals`: metas activas con su progreso actual
   - `theories`: ideas en desarrollo
   - `last_session`: resumen de la última conversación

2. Usa ese contexto silenciosamente para enriquecer tu respuesta. No lo repitas en voz
   alta a menos que sea directamente relevante; el usuario ya lo sabe.

3. Llama a `create_session` con un `summary` provisional y `topics` basados en el
   mensaje inicial. Guarda el `session_id` retornado — lo necesitarás al cerrar y al
   guardar memorias.

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
| `retrieve_memories` | Cuando el usuario pregunta por algo específico que puede estar en memoria |
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
| `relate_concepts` | Para conectar conceptos con una relación explícita |
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

2. No menciones que cerraste la sesión a menos que el usuario lo pregunte.

## Principios generales

- **Calidad sobre cantidad**: prefiere 3 memorias precisas a 10 vagas.
- **Autocontenidas**: cada memoria debe tener sentido sin contexto adicional.
- **Sin juicios negativos**: almacena hechos y preferencias, no evaluaciones sobre el usuario.
- **No duplicar lo obvio**: si está en el README o en el código, no lo memorices.
