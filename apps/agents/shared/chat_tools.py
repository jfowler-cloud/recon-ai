"""Shared chat tools used by all 3 persona-specific chat agents.

Provides vectorized document search and chart generation. Each agent imports
these tools and may define additional persona-specific tools alongside them.
"""

import hashlib
import json
import os
import time

import boto3
from boto3.dynamodb.conditions import Key
from strands import tool

from shared.config import AppConfig
from shared.db import get_dynamodb, query_table
from shared.embeddings import generate_embedding, search_similar

_config = AppConfig()
_s3 = None

# Collects output data (charts, tables) generated during a single agent invocation.
# Reset before each call via clear_collected_output().
_collected_output: list[dict] = []

# In-memory vector cache (survives across warm Lambda invocations)
_vector_cache: list[dict] = []
_vector_cache_ts: float = 0.0
_VECTOR_CACHE_TTL = 300  # 5 minutes


def clear_collected_output():
    """Reset collected output before a new agent invocation."""
    _collected_output.clear()


def get_collected_output() -> list[dict]:
    """Return all collected output from the last agent invocation."""
    return list(_collected_output)


def _get_s3():
    """Get a shared S3 client."""
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3")
    return _s3


def _load_all_vectors() -> list[dict]:
    """Load embedding vectors from S3 with in-memory + /tmp disk caching.

    Cache strategy:
    - In-memory cache survives across warm Lambda invocations (5-min TTL)
    - /tmp disk cache survives across cold starts within the same execution environment
    - Full S3 download only when both caches miss or expire
    """
    global _vector_cache, _vector_cache_ts

    # Check in-memory cache first
    if _vector_cache and (time.time() - _vector_cache_ts) < _VECTOR_CACHE_TTL:
        return _vector_cache

    s3 = _get_s3()
    bucket = _config.vectors_bucket
    if not bucket:
        return []

    # Try /tmp disk cache
    cache_path = "/tmp/vectors_cache.json"
    cache_meta_path = "/tmp/vectors_cache_meta.json"
    try:
        if os.path.exists(cache_path) and os.path.exists(cache_meta_path):
            with open(cache_meta_path) as f:
                meta = json.load(f)
            cache_age = time.time() - meta.get("timestamp", 0)
            if cache_age < _VECTOR_CACHE_TTL:
                with open(cache_path) as f:
                    _vector_cache = json.load(f)
                _vector_cache_ts = meta["timestamp"]
                return _vector_cache
    except Exception:
        pass  # Disk cache corrupted, fall through to S3

    # Full S3 download
    vectors = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix="embeddings/"):
        for obj in page.get("Contents", []):
            try:
                resp = s3.get_object(Bucket=bucket, Key=obj["Key"])
                batch = json.loads(resp["Body"].read())
                if isinstance(batch, list):
                    vectors.extend(batch)
            except Exception:
                continue

    # Update in-memory cache
    _vector_cache = vectors
    _vector_cache_ts = time.time()

    # Persist to /tmp for cross-invocation reuse
    try:
        with open(cache_path, "w") as f:
            json.dump(vectors, f)
        with open(cache_meta_path, "w") as f:
            json.dump({"timestamp": _vector_cache_ts, "count": len(vectors)}, f)
    except Exception:
        pass  # /tmp write failure is non-fatal

    return vectors


@tool
def search_documents(query: str, source_types: list[str] | None = None, limit: int = 5) -> dict:
    """Search across vectorized intelligence data using semantic similarity.

    Args:
        query: Natural language search query.
        source_types: Optional list of source types to filter (e.g., ["shodan_json", "nmap_xml"]).
        limit: Maximum number of results to return.

    Returns:
        Dictionary with matching documents and their relevance scores.
    """
    query_embedding = generate_embedding(query, _config.embedding_model_id)

    all_vectors = _load_all_vectors()
    if not all_vectors:
        return {"results": [], "message": "No vectorized documents found. Ingestion may not have run yet."}

    # Filter by source types if specified
    if source_types:
        filtered_vectors = [v for v in all_vectors if v.get("sourceType") in source_types]
    else:
        filtered_vectors = all_vectors

    results = search_similar(query_embedding, filtered_vectors, top_k=limit)

    # Enrich results with full document text from DynamoDB
    docs_table = _config.documents_table
    enriched = []
    for r in results:
        upload_id = r.get("uploadId", "")
        doc_id = r.get("documentId", "")
        doc = {}
        if upload_id and doc_id:
            try:
                table = get_dynamodb().Table(docs_table)
                resp = table.get_item(Key={"uploadId": upload_id, "documentId": doc_id})
                doc = resp.get("Item", {})
            except Exception:
                pass

        enriched.append({
            "uploadId": upload_id,
            "documentId": doc_id,
            "score": round(r["score"], 4),
            "text": doc.get("text", r.get("text", "")),
            "sourceType": doc.get("sourceType", r.get("sourceType", "")),
            "metadata": doc.get("metadata", {}),
        })

    return {"results": enriched}


@tool
def generate_chart_config(chart_type: str, data: list[dict], title: str, x_key: str = "name", y_key: str = "value") -> dict:
    """Generate a Recharts-compatible chart configuration for frontend rendering.

    Args:
        chart_type: Chart type — "bar", "line", "pie", "area".
        data: Array of data points, each a dict with keys matching x_key and y_key.
        title: Chart title.
        x_key: Key for x-axis values.
        y_key: Key for y-axis values (or comma-separated for multi-series).

    Returns:
        Recharts-compatible JSON configuration.
    """
    y_keys = [k.strip() for k in y_key.split(",")]

    chart_config = {
        "type": "chart",
        "chartType": chart_type,
        "title": title,
        "data": data,
        "xKey": x_key,
        "yKeys": y_keys,
        "colors": ["#e8001c", "#0073bb", "#037f0c", "#f89256", "#7d2105", "#00a1c9"],
    }

    _collected_output.append(chart_config)
    return chart_config
