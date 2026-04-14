-- ============================================================
-- MIGRACIÓN P2-P5 — solo los campos nuevos
-- Aplicar sobre una BD existente sin tocar datos.
-- ============================================================

-- P2: Campos estructurados en sesión
DEFINE FIELD investigated ON session TYPE option<array<string>>;
DEFINE FIELD learned      ON session TYPE option<array<string>>;
DEFINE FIELD completed    ON session TYPE option<array<string>>;
DEFINE FIELD next_steps   ON session TYPE option<array<string>>;

-- P5: Confianza en relaciones de conceptos
DEFINE FIELD confidence ON relates_to TYPE string DEFAULT 'explicit';

-- Normalizar relaciones existentes que no tienen confidence
UPDATE relates_to SET confidence = 'explicit' WHERE confidence = NONE;
