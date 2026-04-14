-- ============================================================
-- fn::embed para Infinity server (OpenAI-compatible API)
-- Reemplaza la versión fastembed cuando se migra al nuevo modelo.
--
-- Deploy con Infinity + jina-clip-v2:
--   docker run --gpus all -p 7997:7997 \
--     michaelf34/infinity:latest v2 \
--     --model-id jinaai/jina-clip-v2 \
--     --served-model-name jinaai/jina-clip-v2
--
-- Variable de entorno en docker-compose:
--   EMBED_URL: http://infinity:7997/v1/embeddings
--   EMBED_MODEL: jinaai/jina-clip-v2
-- ============================================================

REMOVE FUNCTION IF EXISTS fn::embed;
DEFINE FUNCTION fn::embed($text: string) {
    LET $url   = "http://infinity:7997/v1/embeddings";
    LET $model = "jinaai/jina-clip-v2";

    LET $response = http::post($url, {
        model: $model,
        input: [$text]
    });
    RETURN $response.data[0].embedding;
};
