-- ============================================================
-- MIGRACIÓN V3 — Temporal Awareness + Decay + Procedural Memory
-- Aplicar sobre una BD existente sin tocar datos.
-- Todos los campos nuevos tienen defaults para backwards-compatibility.
-- ============================================================

-- ── Temporal Awareness ──────────────────────────────────────
DEFINE FIELD valid_from     ON memory TYPE datetime DEFAULT time::now();
DEFINE FIELD valid_until    ON memory TYPE option<datetime>;
DEFINE FIELD superseded_by  ON memory TYPE option<record<memory>>;

-- ── Decay Tracking ──────────────────────────────────────────
DEFINE FIELD last_accessed  ON memory TYPE datetime DEFAULT time::now();
DEFINE FIELD access_count   ON memory TYPE int DEFAULT 0;

-- ── Procedural Memory ───────────────────────────────────────
DEFINE FIELD procedure_meta ON memory TYPE option<object>;

-- ── Inicializar campos en memorias existentes ───────────────
UPDATE memory SET
    valid_from    = created_at,
    last_accessed = updated_at,
    access_count  = 0
WHERE valid_from IS NONE;
