"""Embeddings — Titan v2 embedding generation and cosine similarity search.

Pattern from portfolio-intelligence: pure Python math (no numpy), importance
weighting, file type filtering.
"""

import json
import math

import boto3

_bedrock = None


def get_bedrock():
    """Get a shared Bedrock Runtime client."""
    global _bedrock
    if _bedrock is None:
        _bedrock = boto3.client("bedrock-runtime", config=boto3.session.Config(retries={"mode": "adaptive", "max_attempts": 3}))
    return _bedrock


def generate_embedding(text: str, model_id: str = "amazon.titan-embed-text-v2:0") -> list[float]:
    """Generate an embedding vector for the given text."""
    client = get_bedrock()
    response = client.invoke_model(
        modelId=model_id,
        body=json.dumps({"inputText": text[:8000]}),
    )
    return json.loads(response["body"].read()).get("embedding", [])


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors (pure Python)."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# Importance score boosts
IMPORTANCE_BOOST = {
    "high": 0.08,
    "medium": 0.03,
    "standard": 0.0,
}


def search_similar(
    query_embedding: list[float],
    vectors: list[dict],
    top_k: int = 5,
    source_type_filter: str | None = None,
) -> list[dict]:
    """Search for similar documents using cosine similarity with importance weighting.

    Args:
        query_embedding: The query vector.
        vectors: List of dicts with 'embedding', 'importance', optional 'sourceType'.
        top_k: Number of results to return.
        source_type_filter: Optional filter by source type.

    Returns:
        Top-k results sorted by weighted score.
    """
    results = []
    for v in vectors:
        if source_type_filter and v.get("sourceType") != source_type_filter:
            continue

        similarity = cosine_similarity(query_embedding, v["embedding"])
        boost = IMPORTANCE_BOOST.get(v.get("importance", "standard"), 0.0)
        total_score = similarity + boost

        results.append({**v, "score": round(total_score, 4)})

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]
