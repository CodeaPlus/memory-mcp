# Roadmap / Ideas futuras

## Posible mejora: soporte para sesiones paralelas (branches)

**Contexto:** El hook actual (`UserPromptSubmit`) trackea la sesión activa usando `transcript_path`. Esto funciona bien para uso secuencial (una conversación activa a la vez), como cuando se usa la interfaz de Claude.

**Problema que resolvería:** Usuarios que abren múltiples terminales con Claude CLI simultáneamente. Cada terminal genera un `transcript_path` distinto pero el hook no las distingue — podrían interferir si alternan rápido.

**Propuesta:**
- Usar `transcript_path + sessionId` como clave de tracking en vez de solo `transcript_path`
- Cada terminal/conversación mantiene su propia "rama" de memoria activa simultáneamente
- Al cerrar una rama, sus memorias se consolidan a la rama principal (similar a merge en git)
- Conflictos: la memoria más reciente gana, o se marcan para revisión manual

**Prioridad:** Baja — no es necesario para el caso de uso principal (interfaz de Claude).

**Estado:** Idea documentada, sin implementar.
