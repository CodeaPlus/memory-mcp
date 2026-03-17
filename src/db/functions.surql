-- ============================================================
-- FUNCIONES SURREALDB — memory-mcp
-- Ejecutar contra SurrealDB para definir/actualizar funciones.
-- ============================================================

-- ── Base: embedding vía fastembed ───────────────────────────
DEFINE FUNCTION fn::embed($text: string) {
    LET $response = http::post(
        "http://fastembed:8000/embeddings",
        { texts: [$text] }
    );
    RETURN $response.embeddings[0];
};

-- ── Memory ──────────────────────────────────────────────────
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

DEFINE FUNCTION fn::update_memory(
    $memory_id: record<memory>,
    $data: object
) {
    RETURN UPDATE $memory_id MERGE $data;
};

DEFINE FUNCTION fn::search_memories(
    $query: string,
    $domain: string,
    $limit: int,
    $threshold: float
) {
    LET $embedding = fn::embed($query);
    RETURN (
        SELECT content, type, domain, importance,
            vector::similarity::cosine(embedding, $embedding) AS score
        FROM memory
        WHERE vector::similarity::cosine(embedding, $embedding) > $threshold
          AND ($domain = "all" OR domain = $domain)
        ORDER BY importance DESC, score DESC
        LIMIT $limit
    );
};

-- ── Theory ──────────────────────────────────────────────────
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

DEFINE FUNCTION fn::link_theory_session(
    $theory_id: record<theory>,
    $session_id: record<session>
) {
    RETURN RELATE $theory_id->derived_from->$session_id;
};

-- ── Session ─────────────────────────────────────────────────
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
        SELECT summary, topics, domain, created_at
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

DEFINE FUNCTION fn::complete_milestone($milestone_id: record<milestone>) {
    RETURN UPDATE $milestone_id SET
        completed    = true,
        completed_at = time::now();
};

DEFINE FUNCTION fn::update_goal_status($goal_id: record<goal>, $status: string) {
    RETURN UPDATE $goal_id SET status = $status;
};

-- ── Concepts ────────────────────────────────────────────────
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

DEFINE FUNCTION fn::relate_concepts(
    $from: record<concept>,
    $to: record<concept>,
    $strength: float,
    $description: option<string>
) {
    RETURN RELATE $from->relates_to->$to CONTENT {
        strength:    $strength,
        description: $description
    };
};

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

DEFINE FUNCTION fn::get_concept_graph($concept_id: record<concept>) {
    LET $node = (SELECT id, name, description, domain, importance FROM $concept_id)[0];
    LET $edges = (
        SELECT
            ->relates_to.strength    AS strength,
            ->relates_to.description AS rel_description,
            ->relates_to->concept.*  AS related
        FROM $concept_id
    );
    RETURN {
        concept:  $node,
        related:  $edges
    };
};
