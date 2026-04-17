# memory-mcp

Servidor MCP (Model Context Protocol) para gestión de memoria persistente con búsqueda semántica, respaldado por SurrealDB.

Permite a agentes de IA (como Claude Code) almacenar y recuperar memorias, sesiones, teorías y objetivos de forma persistente entre conversaciones. La búsqueda utiliza embeddings semánticos con Gemini Embedding 2.

## Quick Start

### Requisitos previos

- Node.js 22+
- Docker y Docker Compose
- API key de Google Gemini ([obtener aquí](https://aistudio.google.com/apikey))

### 1. Clona e instala

```bash
git clone https://github.com/CodeaPlus/memory-mcp.git
cd memory-mcp
npm install
```

### 2. Configura las variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y como mínimo configura `GEMINI_API_KEY`.

### 3. Levanta las dependencias (SurrealDB + servicio de embeddings)

```bash
cd docker/dev
GEMINI_API_KEY=tu-api-key docker compose up -d
```

Esto levanta:
- **SurrealDB** en `ws://localhost:8001`
- **gemini-embed** (servicio de embeddings) en `http://localhost:8002`

### 4. Inicializa la base de datos (solo la primera vez)

```bash
npm run db:setup
```

Aplica el schema y las funciones SurrealDB necesarias.

### 5. Verifica que todo funciona

```bash
npm run db:test
```

### 6. Ejecuta el servidor MCP

```bash
# Modo desarrollo (stdio)
npm run dev

# Modo producción
npm run build && npm start
```

---

## Integración con Claude Code

Agrega a tu `.mcp.json` (modo stdio, recomendado para uso local):

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/ruta/absoluta/al/proyecto/dist/index.js"],
      "env": {
        "SURREAL_URL": "ws://localhost:8001",
        "SURREAL_NS": "personal",
        "SURREAL_DB": "memory",
        "SURREAL_USER": "root",
        "SURREAL_PASS": "root"
      }
    }
  }
}
```

Para automatizar la gestión de sesiones con hooks, consulta [`skills/memory/SKILL.md`](skills/memory/SKILL.md).

---

## Herramientas MCP disponibles

| Herramienta | Descripción |
|---|---|
| `store_memory` | Almacena una memoria con tipo, dominio e importancia |
| `retrieve_memories` | Recupera memorias por similitud semántica |
| `search_memories_index` | Búsqueda ligera (solo snippet + score) |
| `get_memory_detail` | Detalle completo de una memoria por ID |
| `create_session` | Crea una nueva sesión de conversación |
| `end_session` | Cierra la sesión y persiste memorias destiladas |
| `get_session_context` | Recupera contexto relevante para iniciar una sesión |
| `list_sessions` | Lista sesiones anteriores |
| `get_messages` | Recupera mensajes de una sesión |
| `add_message` | Agrega un mensaje a la sesión actual |
| `store_theory` | Almacena una teoría o insight |
| `update_theory` | Actualiza estado o contenido de una teoría |
| `search_theories` | Busca teorías por similitud semántica |
| `create_concept` | Crea un concepto en el grafo de ideas |
| `relate_concepts` | Relaciona dos conceptos entre sí |
| `get_concept_graph` | Recupera un concepto y sus relaciones |
| `search_concepts` | Busca conceptos por similitud semántica |
| `get_goals` | Obtiene objetivos y su progreso |
| `create_goal` | Crea un nuevo objetivo |
| `update_goal_progress` | Actualiza el progreso de un objetivo |
| `update_goal_status` | Cambia el estado de un objetivo |
| `add_milestone` | Agrega un hito a un objetivo |
| `complete_milestone` | Marca un hito como completado |
| `consolidate_memories` | Encuentra memorias redundantes para sintetizar |

---

## Modo HTTP (despliegue remoto)

Para exponer el servidor vía HTTP (útil con Claude.ai o integraciones remotas):

```bash
MCP_TRANSPORT=http PORT=3000 npm start
```

Endpoints disponibles:
- `POST /mcp` — endpoint MCP (StreamableHTTP)
- `GET /health` — health check

---

## Docker (producción)

Requiere una instancia de SurrealDB externa (self-hosted o cloud):

```bash
cd docker/production
# Edita docker-compose.yml con tus credenciales de SurrealDB y GEMINI_API_KEY
docker compose up -d --build
```

### CI/CD

El workflow `.github/workflows/docker-publish.yml` construye y publica la imagen al hacer push a `main`.

Secrets requeridos:

| Secret | Descripción |
|---|---|
| `REGISTRY_URL` | URL del registry Docker privado |
| `REGISTRY_USERNAME` | Usuario del registry |
| `REGISTRY_PASSWORD` | Contraseña del registry |

---

## Estructura del proyecto

```
memory-mcp/
├── src/
│   ├── index.ts              # Entry point, transportes MCP
│   ├── db.ts                 # Conexión singleton a SurrealDB
│   ├── db/
│   │   ├── schema.surql      # Definición de tablas
│   │   └── functions.surql   # Funciones SurrealDB (embed, search, etc.)
│   └── tools/
│       ├── memory.ts         # store_memory / retrieve_memories
│       ├── session.ts        # create_session / end_session / get_session_context
│       ├── theory.ts         # store_theory / update_theory / search_theories
│       ├── concepts.ts       # create_concept / relate_concepts / search_concepts
│       └── goals.ts          # get_goals / create_goal / update_goal_progress
├── scripts/
│   ├── setup-db.ts           # Inicializa schema y funciones en SurrealDB
│   └── test-connection.ts    # Verifica que todo funciona
├── docker/
│   ├── dev/
│   │   └── docker-compose.yml  # SurrealDB + gemini-embed para desarrollo local
│   ├── production/
│   │   ├── Dockerfile
│   │   └── docker-compose.yml
│   └── gemini-embed/
│       ├── server.mjs        # Servicio de embeddings (wrapper Gemini API)
│       └── Dockerfile
└── skills/
    └── memory/
        └── SKILL.md          # Skill para Claude Code (automatización de sesiones)
```

---

## Stack

- **Runtime**: Node.js 22 / TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Base de datos**: SurrealDB (`@surrealdb/node`)
- **Embeddings**: Gemini Embedding 2 (via gemini-embed microservicio)
- **Validación**: Zod
