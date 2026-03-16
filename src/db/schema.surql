-- =====================
-- SESIONES Y MENSAJES
-- =====================
DEFINE TABLE session SCHEMAFUL;
DEFINE FIELD created_at ON session TYPE datetime DEFAULT time::now();
DEFINE FIELD summary    ON session TYPE string;
DEFINE FIELD topics     ON session TYPE array<string>;
DEFINE FIELD domain     ON session TYPE string; -- 'research' | 'business' | 'mixed'

DEFINE TABLE message SCHEMAFUL;
DEFINE FIELD session_id ON message TYPE record<session>;
DEFINE FIELD role       ON message TYPE string; -- 'user' | 'assistant'
DEFINE FIELD content    ON message TYPE string;
DEFINE FIELD created_at ON message TYPE datetime DEFAULT time::now();
DEFINE FIELD embedding  ON message TYPE array<float>;

DEFINE INDEX idx_message_session ON message FIELDS session_id;
DEFINE INDEX idx_message_vector  ON message FIELDS embedding;

-- =====================
-- MEMORIA SINTETIZADA
-- =====================
-- Entries destiladas después de cada sesión, lo que yo necesito
-- recuperar para tener contexto útil sin cargar todo el historial
DEFINE TABLE memory SCHEMAFUL;
DEFINE FIELD content     ON memory TYPE string;
DEFINE FIELD embedding   ON memory TYPE array<float>;
DEFINE FIELD type        ON memory TYPE string;
    -- 'preference' | 'fact' | 'progress' | 'insight' | 'theory_seed'
DEFINE FIELD importance  ON memory TYPE int DEFAULT 1; -- escala 1-5
DEFINE FIELD domain      ON memory TYPE string; -- 'research' | 'business' | 'personal'
DEFINE FIELD created_at  ON memory TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at  ON memory TYPE datetime DEFAULT time::now();
DEFINE FIELD source      ON memory TYPE option<record>; -- session | theory | goal

DEFINE INDEX idx_memory_vector ON memory FIELDS embedding;
DEFINE INDEX idx_memory_domain ON memory FIELDS domain, importance;

-- =====================
-- TEORÍAS E INVESTIGACIÓN
-- =====================
DEFINE TABLE theory SCHEMAFUL;
DEFINE FIELD title      ON theory TYPE string;
DEFINE FIELD content    ON theory TYPE string;
DEFINE FIELD status     ON theory TYPE string DEFAULT 'raw';
    -- 'raw' | 'developing' | 'formalized' | 'published'
DEFINE FIELD domain     ON theory TYPE string;
    -- 'physics' | 'computing' | 'cross' | 'energy'
DEFINE FIELD tags       ON theory TYPE array<string>;
DEFINE FIELD embedding  ON theory TYPE array<float>;
DEFINE FIELD created_at ON theory TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON theory TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_theory_vector ON theory FIELDS embedding;
DEFINE INDEX idx_theory_status ON theory FIELDS status, domain;

-- Conceptos clave con relaciones entre sí (el grafo de ideas)
DEFINE TABLE concept SCHEMAFUL;
DEFINE FIELD name        ON concept TYPE string;
DEFINE FIELD description ON concept TYPE string;
DEFINE FIELD embedding   ON concept TYPE array<float>;
DEFINE FIELD domain      ON concept TYPE string;
DEFINE FIELD importance  ON concept TYPE int DEFAULT 1;

DEFINE INDEX idx_concept_vector ON concept FIELDS embedding;

-- Edge: relación entre conceptos
DEFINE TABLE relates_to SCHEMALESS TYPE RELATION
    FROM concept TO concept;
DEFINE FIELD strength ON relates_to TYPE float DEFAULT 1.0;
DEFINE FIELD description ON relates_to TYPE option<string>;

-- Edge: teoría derivada de sesión
DEFINE TABLE derived_from SCHEMALESS TYPE RELATION
    FROM theory TO session;

-- =====================
-- OBJETIVOS Y PROGRESO
-- =====================
DEFINE TABLE goal SCHEMAFUL;
DEFINE FIELD title       ON goal TYPE string;
DEFINE FIELD description ON goal TYPE string;
DEFINE FIELD type        ON goal TYPE string; -- 'financial' | 'research' | 'product'
DEFINE FIELD target      ON goal TYPE any;
DEFINE FIELD current     ON goal TYPE any DEFAULT 0;
DEFINE FIELD unit        ON goal TYPE string; -- 'USD/month' | 'papers' | etc
DEFINE FIELD deadline    ON goal TYPE option<datetime>;
DEFINE FIELD status      ON goal TYPE string DEFAULT 'active';
DEFINE FIELD created_at  ON goal TYPE datetime DEFAULT time::now();

DEFINE TABLE milestone SCHEMAFUL;
DEFINE FIELD goal_id     ON milestone TYPE record<goal>;
DEFINE FIELD title       ON milestone TYPE string;
DEFINE FIELD description ON milestone TYPE option<string>;
DEFINE FIELD completed   ON milestone TYPE bool DEFAULT false;
DEFINE FIELD completed_at ON milestone TYPE option<datetime>;
DEFINE FIELD order       ON milestone TYPE int;

DEFINE INDEX idx_milestone_goal ON milestone FIELDS goal_id, order;
