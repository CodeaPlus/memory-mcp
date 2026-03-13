# memory-mcp

Servidor MCP (Model Context Protocol) para gestión de memoria persistente con búsqueda semántica, respaldado por SurrealDB.

## Descripción

`memory-mcp` expone un conjunto de herramientas MCP que permiten a agentes de IA almacenar y recuperar memorias, sesiones, teorías y objetivos de forma persistente entre conversaciones. La búsqueda de memorias utiliza embeddings semánticos almacenados en SurrealDB.

## Herramientas disponibles

| Herramienta | Descripción |
|---|---|
| `store_memory` | Almacena una memoria con tipo, dominio e importancia |
| `retrieve_memories` | Recupera memorias por similitud semántica |
| `create_session` | Crea una nueva sesión de conversación |
| `end_session` | Cierra la sesión y persiste memorias destiladas |
| `get_session_context` | Recupera contexto relevante para iniciar una sesión |
| `store_theory` | Almacena una teoría o insight de investigación |
| `update_theory` | Actualiza estado o contenido de una teoría existente |
| `get_goals` | Obtiene objetivos y su progreso actual |
| `update_goal_progress` | Actualiza el progreso de un objetivo |

## Requisitos

- Node.js 22+
- SurrealDB (con soporte de embeddings semánticos configurado)

## Instalación

```bash
npm install
```

## Configuración

Copia `.env.example` a `.env` y configura las variables:

```env
# Transporte: "stdio" (default) o "http"
MCP_TRANSPORT=stdio
PORT=3000

# SurrealDB
SURREAL_URL=ws://localhost:8000
SURREAL_NS=personal
SURREAL_DB=memory
SURREAL_USER=root
SURREAL_PASS=root
```

## Uso

### Modo stdio (para integraciones MCP locales)

```bash
# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

### Modo HTTP (StreamableHTTP)

```bash
MCP_TRANSPORT=http PORT=3000 npm start
```

El servidor queda disponible en `http://localhost:3000/mcp` con health check en `/health`.

### Configuración en Claude Code

Agrega al archivo de configuración MCP (`.mcp.json` o equivalente):

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/ruta/al/proyecto/dist/index.js"],
      "env": {
        "SURREAL_URL": "ws://localhost:8000",
        "SURREAL_NS": "personal",
        "SURREAL_DB": "memory",
        "SURREAL_USER": "root",
        "SURREAL_PASS": "root"
      }
    }
  }
}
```

## Docker

### Construcción y ejecución local

```bash
cd docker/production
docker compose up --build
```

### Variables de entorno para producción

Edita `docker/production/docker-compose.yml` o pásalas directamente:

```bash
docker run -d \
  -e MCP_TRANSPORT=http \
  -e PORT=3000 \
  -e SURREAL_URL=wss://tu-surreal.example.com \
  -e SURREAL_NS=personal \
  -e SURREAL_DB=memory \
  -e SURREAL_USER=root \
  -e SURREAL_PASS=tu-password \
  -p 3000:3000 \
  memory-mcp:latest
```

## CI/CD

El workflow `.github/workflows/docker-publish.yml` construye y publica la imagen automáticamente al hacer push a `main`.

Requiere los siguientes secrets en el repositorio:

| Secret | Descripción |
|---|---|
| `REGISTRY_URL` | URL del registry Docker privado |
| `REGISTRY_USERNAME` | Usuario del registry |
| `REGISTRY_PASSWORD` | Contraseña del registry |

## Estructura del proyecto

```
memory-mcp/
├── src/
│   ├── index.ts          # Entry point, factory MCP + transportes
│   ├── db.ts             # Conexión singleton a SurrealDB
│   └── tools/
│       ├── memory.ts     # store_memory / retrieve_memories
│       ├── session.ts    # create_session / end_session / get_session_context
│       ├── theory.ts     # store_theory / update_theory
│       └── goals.ts      # get_goals / update_goal_progress
├── docker/
│   └── production/
│       ├── Dockerfile
│       └── docker-compose.yml
└── .github/
    └── workflows/
        └── docker-publish.yml
```

## Stack

- **Runtime**: Node.js 22 / TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Base de datos**: SurrealDB (`@surrealdb/node`)
- **Validación**: Zod
