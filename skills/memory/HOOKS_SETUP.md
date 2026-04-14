# Configuración de Hooks — Memoria Automática

Estos hooks hacen que la memoria se cargue y guarde automáticamente en
**cualquier LLM que soporte Claude Code hooks**, sin necesidad de invocar
el skill `/memory` manualmente.

## Requisitos

- El servidor memory-mcp corriendo en modo HTTP (`MCP_TRANSPORT=http`)
- Node.js 22+ disponible en PATH

## Instalación

1. Copia o vincula los scripts a una ruta permanente, por ejemplo:

   ```
   C:\Users\<usuario>\.claude\hooks\
   ```

2. Abre (o crea) el archivo de configuración global de Claude Code:

   ```
   C:\Users\<usuario>\.claude\settings.json
   ```

3. Agrega la sección `hooks`:

   ```json
   {
     "hooks": {
       "UserPromptSubmit": [
         {
           "hooks": [
             {
               "type": "command",
               "command": "node C:\\Users\\<usuario>\\.claude\\hooks\\hook-prompt-submit.mjs"
             }
           ]
         }
       ],
       "Stop": [
         {
           "hooks": [
             {
               "type": "command",
               "command": "node C:\\Users\\<usuario>\\.claude\\hooks\\hook-stop.mjs"
             }
           ]
         }
       ]
     }
   }
   ```

4. Si el servidor corre en un puerto diferente al 3000, define la variable de entorno:

   ```json
   "env": { "MEMORY_MCP_URL": "http://localhost:XXXX" }
   ```

   O agrégala al sistema antes de lanzar Claude Code.

## Flujo resultante

```
Usuario escribe prompt
       ↓
UserPromptSubmit hook dispara
       ↓
GET /context?q=<prompt> → memory-mcp
       ↓ crea sesión automáticamente
       ↓ recupera memorias + metas + última sesión
       ↓
Contexto inyectado antes del prompt
       ↓
LLM responde con contexto de memoria
       ↓
Stop hook dispara
       ↓
POST /session/auto-end → memory-mcp
       ↓
Sesión cerrada con resumen extraído del transcript
```

## Si el servidor no está disponible

Ambos hooks fallan silenciosamente (exit 0) sin interrumpir la conversación.
La memoria simplemente no se carga/guarda ese turno.

## Variables de entorno

| Variable          | Default                  | Descripción                        |
|-------------------|--------------------------|------------------------------------|
| `MEMORY_MCP_URL`  | `http://localhost:3000`  | URL base del servidor memory-mcp   |
