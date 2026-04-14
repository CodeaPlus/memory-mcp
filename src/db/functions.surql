-- ============================================================
-- FUNCIONES SURREALDB — memory-mcp
-- Ejecutar contra SurrealDB para definir/actualizar funciones.
-- ============================================================

-- ── Base: embedding vía gemini-embed ────────────────────────
-- Wrapper HTTP compatible con la API de fastembed.
-- Internamente llama a Gemini Embedding 2 (batchEmbedContents).
-- Dimensiones configuradas en el servicio (default: 1536).
REMOVE FUNCTION IF EXISTS fn::embed;
DEFINE FUNCTION fn::embed($text: string) {
    LET $response = http::post(
        "http://gemini-embed:8000/embeddings",
        { texts: [$text] }
    );
    RETURN $response.embeddings[0];
};

-- ── Memory ──────────────────────────────────────────────────
REMOVE FUNCTION IF EXISTS fn::store_memory;
DEFINE FUNCTION fn::store_memory(
    $content: string,
    $type: string,
    $domain: string,
    $importance: int,
    $source: option<record>
) {
    LET $embedding = fn::embed($content);
    RETURN CREATE memory CONTENT {
        content:    $content,
        embedding:  $embedding,
        type:       $type,
        domain:     $domain,
        importance: $importance,
        source:     $source,
        created_at: time::now(),
        updated_at: time::now()
    };
};

REMOVE FUNCTION IF EXISTS fn::update_memory;
DEFINE FUNCTION fn::update_memory(
    $memory_id: record<memory>,
    $data: object
) {
    IF $data.content != NONE {
        LET $embedding = fn::embed($data.content);
        UPDATE $memory_id MERGE $data;
        RETURN UPDATE $memory_id SET embedding = $embedding, updated_at = time::now();
    };
    UPDATE $memory_id MERGE $data;
    RETURN UPDATE $memory_id SET updated_at = time::now();
};

REMOVE FUNCTION IF EXISTS fn::search_memories;
DEFINE FUNCTION fn::search_memories(
    $query: string,
    $domain: string,
    $limit: int,
    $threshold: float
) {
    LET $embedding = fn::embed($query);
    RETURN (
        SELECT id, content, type, domain, importance, source,
            vector::similarity::cosine(embedding, $embedding) AS score
        FROM memory
        WHERE vector::similarity::cosine(embedding, $embedding) > $threshold
          AND ($domain = "all" OR domain = $domain)
        ORDER BY importance DESC, score DESC
        LIMIT $limit
    );
};

-- ── Theory ──────────────────────────────────────────────────
REMOVE FUNCTION IF EXISTS fn::store_theory;
DEFINE FUNCTION fn::store_theory(
    $title: string,
    $content: string,
    $domain: string,
    $tags: array
) {
    LET $embedding = fn::embed($title + " " + $content);
    RETURN CREATE theory CONTENT {
        title:      $title,
        content:    $content,
        embedding:  $embedding,
        domain:     $domain,
        tags:       $tags,
        status:     "raw",
        created_at: time::now(),
        updated_at: time::now()
    };
};

REMOVE FUNCTION IF EXISTS fn::search_theories;
DEFINE FUNCTION fn::search_theories(
    $query: string,
    $domain: string,
    $status: string,
    $limit: int
) {
    LET $embedding = fn::embed($query);
    RETURN (
        SELECT id, title, domain, status, tags, updated_at,
            vector::similarity::cosine(embedding, $embedding) AS score
        FROM theory
        WHERE vector::similarity::cosine(embedding, $embedding) > 0.6
          AND ($domain = "all" OR domain = $domain)
          AND ($status = "all" OR status = $status)
        ORDER BY score DESC
        LIMIT $limit
    );
};

REMOVE FUNCTION IF EXISTS fn::link_theory_session;
DEFINE FUNCTION fn::link_theory_session(
    $theory_id: record<theory>,
    $session_id: record<session>
) {
    RETURN RELATE $theory_id->derived_from->$session_id;
};

-- ── Session ─────────────────────────────────────────────────
REMOVE FUNCTION IF EXISTS fn::get_session_context;
DEFINE FUNCTION fn::get_session_context($query: string) {
    LET $embedding = fn::embed($query);
    LET $memories = (
        SELECT content, type, domain, importance,
            vector::similarity::cosine(embedding, $embedding) AS score
        FROM memory
        WHERE vector::similarity::cosine(embedding, $embedding) > 0.70
        ORDER BY importance DESC, score DESC
        LIMIT 5
    );
    LET $goals = (
        SELECT title, type, target, current, unit, status
        FROM goal
        WHERE status = "active"
    );
    LET $theories = (
        SELECT title, status, tags, updated_at
        FROM theory
        WHERE status IN ["raw", "developing"]
        ORDER BY updated_at DESC
        LIMIT 3
    );
    LET $last_session = (
        SELECT summary, topics, domain, created_at,
               investigated, learned, completed, next_steps
        FROM session
        ORDER BY created_at DESC
        LIMIT 1
    );
    RETURN {
        memories:     $memories,
        goals:        $goals,
        theories:     $theories,
        last_session: $last_session
    };
};

REMOVE FUNCTION IF EXISTS fn::list_sessions;
DEFINE FUNCTION fn::list_sessions($domain: string, $limit: int) {
    RETURN (
        SELECT id, summary, topics, domain, created_at
        FROM session
        WHERE $domain = "all" OR domain = $domain
        ORDER BY created_at DESC
        LIMIT $limit
    );
};

-- ── Messages ────────────────────────────────────────────────
REMOVE FUNCTION IF EXISTS fn::add_message;
DEFINE FUNCTION fn::add_message(
    $session_id: record<session>,
    $role: string,
    $content: string
) {
    LET $embedding = fn::embed($content);
    RETURN CREATE message CONTENT {
        session_id: $session_id,
        role:       $role,
        content:    $content,
        embedding:  $embedding,
        created_at: time::now()
    };
};

REMOVE FUNCTION IF EXISTS fn::get_messages;
DEFINE FUNCTION fn::get_messages($session_id: record<session>, $limit: int) {
    RETURN (
        SELECT role, content, created_at
        FROM message
        WHERE session_id = $session_id
        ORDER BY created_at ASC
        LIMIT $limit
    );
};

-- ── Goals ───────────────────────────────────────────────────
REMOVE FUNCTION IF EXISTS fn::create_goal;
DEFINE FUNCTION fn::create_goal(
    $title: string,
    $description: string,
    $type: string,
    $target: any,
    $current: any,
    $unit: string,
    $deadline: option<datetime>
) {
    RETURN CREATE goal CONTENT {
        title:       $title,
        description: $description,
        type:        $type,
        target:      $target,
        current:     $current,
        unit:        $unit,
        deadline:    $deadline,
        status:      "active",
        created_at:  time::now()
    };
};

REMOVE FUNCTION IF EXISTS fn::add_milestone;
DEFINE FUNCTION fn::add_milestone(
    $goal_id: record<goal>,
    $title: string,
    $description: option<string>,
    $order: int
) {
    RETURN CREATE milestone CONTENT {
        goal_id:     $goal_id,
        title:       $title,
        description: $description,
        completed:   false,
        order:       $order
    };
};

REMOVE FUNCTION IF EXISTS fn::complete_milestone;
DEFINE FUNCTION fn::complete_milestone($milestone_id: record<milestone>) {
    RETURN UPDATE $milestone_id SET
        completed    = true,
        completed_at = time::now();
};

REMOVE FUNCTION IF EXISTS fn::update_goal_status;
DEFINE FUNCTION fn::update_goal_status($goal_id: record<goal>, $status: string) {
    RETURN UPDATE $goal_id SET status = $status;
};

-- ── Concepts ────────────────────────────────────────────────
REMOVE FUNCTION IF EXISTS fn::create_concept;
DEFINE FUNCTION fn::create_concept(
    $name: string,
    $description: string,
    $domain: string,
    $importance: int
) {
    LET $embedding = fn::embed($name + ": " + $description);
    RETURN CREATE concept CONTENT {
        name:        $name,
        description: $description,
        embedding:   $embedding,
        domain:      $domain,
        importance:  $importance
    };
};

REMOVE FUNCTION IF EXISTS fn::relate_concepts;
DEFINE FUNCTION fn::relate_concepts(
    $from: record<concept>,
    $to: record<concept>,
    $strength: float,
    $confidence: string,
    $description: option<string>
) {
    RETURN RELATE $from->relates_to->$to CONTENT {
        strength:    $strength,
        confidence:  $confidence,
        description: $description
    };
};

REMOVE FUNCTION IF EXISTS fn::search_concepts;
DEFINE FUNCTION fn::search_concepts(
    $query: string,
    $domain: string,
    $limit: int
) {
    LET $embedding = fn::embed($query);
    RETURN (
        SELECT id, name, description, domain, importance,
            vector::similarity::cosine(embedding, $embedding) AS score
        FROM concept
        WHERE vector::similarity::cosine(embedding, $embedding) > 0.6
          AND ($domain = "all" OR domain = $domain)
        ORDER BY importance DESC, score DESC
        LIMIT $limit
    );
};

REMOVE FUNCTION IF EXISTS fn::get_concept_graph;
DEFINE FUNCTION fn::get_concept_graph($concept_id: record<concept>) {
    LET $node = (SELECT id, name, description, domain, importance FROM $concept_id)[0];
    LET $edges = (
        SELECT
            ->relates_to.strength    AS strength,
            ->relates_to.confidence  AS confidence,
            ->relates_to.description AS rel_description,
            ->relates_to->concept.*  AS related
        FROM $concept_id
    );
    RETURN {
        concept:  $node,
        related:  $edges
    };
};

-- ── P4: Búsqueda en 3 capas ──────────────────────────────────────────────────
-- Capa 1: índice ligero — devuelve solo ID, snippet y score para filtrar rápido
REMOVE FUNCTION IF EXISTS fn::search_memories_index;
DEFINE FUNCTION fn::search_memories_index(
    $query: string,
    $domain: string,
    $limit: int,
    $threshold: float
) {
    LET $embedding = fn::embed($query);
    RETURN (
        SELECT id,
            string::slice(content, 0, 120) AS snippet,
            type, domain, importance,
            vector::similarity::cosine(embedding, $embedding) AS score
        FROM memory
        WHERE vector::similarity::cosine(embedding, $embedding) > $threshold
          AND ($domain = "all" OR domain = $domain)
        ORDER BY importance DESC, score DESC
        LIMIT $limit
    );
};

-- Capa 2: detalle completo por ID (se llama solo para las memorias elegidas)
REMOVE FUNCTION IF EXISTS fn::get_memory_detail;
DEFINE FUNCTION fn::get_memory_detail($memory_id: record<memory>) {
    RETURN (SELECT id, content, type, domain, importance, source, created_at, updated_at
            FROM $memory_id)[0];
};

-- ── P3: Consolidación de memorias ────────────────────────────────────────────
-- Devuelve pares de memorias con similitud >= threshold para que el LLM
-- decida cuáles sintetizar, fusionar o eliminar.
-- Enfoque simple: tomamos candidatas y buscamos similares con un query por registro.
REMOVE FUNCTION IF EXISTS fn::consolidate_memories;
DEFINE FUNCTION fn::consolidate_memories(
    $domain: string,
    $threshold: float,
    $limit: int
) {
    LET $candidates = (
        SELECT id, content, type, domain, importance, embedding
        FROM memory
        WHERE $domain = "all" OR domain = $domain
        ORDER BY importance ASC
        LIMIT $limit
    );
    RETURN array::map($candidates, |$m| {
        LET $similar = (
            SELECT id, content, type, importance,
                vector::similarity::cosine(embedding, $m.embedding) AS score
            FROM memory
            WHERE id != $m.id
              AND vector::similarity::cosine(embedding, $m.embedding) >= $threshold
            ORDER BY score DESC
            LIMIT 5
        );
        RETURN {
            anchor_id:      $m.id,
            anchor_content: $m.content,
            type:           $m.type,
            domain:         $m.domain,
            importance:     $m.importance,
            similar:        $similar
        };
    });
};
