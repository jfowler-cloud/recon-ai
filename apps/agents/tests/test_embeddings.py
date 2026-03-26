"""Tests for shared.embeddings module."""

import json
import math
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest

import shared.embeddings as emb_mod
from shared.embeddings import (
    IMPORTANCE_BOOST,
    cosine_similarity,
    generate_embedding,
    search_similar,
)


@pytest.fixture(autouse=True)
def _reset_bedrock_singleton():
    """Reset the module-level Bedrock client singleton before each test."""
    emb_mod._bedrock = None
    yield
    emb_mod._bedrock = None


# --- cosine_similarity ---


def test_cosine_similarity_identical_vectors():
    """Identical vectors have similarity 1.0."""
    v = [1.0, 2.0, 3.0]
    assert cosine_similarity(v, v) == pytest.approx(1.0)


def test_cosine_similarity_orthogonal_vectors():
    """Orthogonal vectors have similarity 0.0."""
    a = [1.0, 0.0]
    b = [0.0, 1.0]
    assert cosine_similarity(a, b) == pytest.approx(0.0)


def test_cosine_similarity_opposite_vectors():
    """Opposite vectors have similarity -1.0."""
    a = [1.0, 0.0]
    b = [-1.0, 0.0]
    assert cosine_similarity(a, b) == pytest.approx(-1.0)


def test_cosine_similarity_zero_vector_a():
    """Zero vector a returns 0.0."""
    assert cosine_similarity([0.0, 0.0], [1.0, 2.0]) == 0.0


def test_cosine_similarity_zero_vector_b():
    """Zero vector b returns 0.0."""
    assert cosine_similarity([1.0, 2.0], [0.0, 0.0]) == 0.0


def test_cosine_similarity_both_zero():
    """Both zero vectors returns 0.0."""
    assert cosine_similarity([0.0, 0.0], [0.0, 0.0]) == 0.0


def test_cosine_similarity_known_value():
    """Verify known cosine similarity value."""
    a = [1.0, 2.0, 3.0]
    b = [4.0, 5.0, 6.0]
    # dot = 32, norm_a = sqrt(14), norm_b = sqrt(77)
    expected = 32 / (math.sqrt(14) * math.sqrt(77))
    assert cosine_similarity(a, b) == pytest.approx(expected)


# --- IMPORTANCE_BOOST ---


def test_importance_boost_values():
    """Verify the importance boost mapping."""
    assert IMPORTANCE_BOOST["high"] == 0.08
    assert IMPORTANCE_BOOST["medium"] == 0.03
    assert IMPORTANCE_BOOST["standard"] == 0.0


# --- search_similar ---


def _make_vector(embedding, importance="standard", source_type=None, doc_id=None):
    """Helper to build a vector dict."""
    v = {"embedding": embedding, "importance": importance}
    if source_type:
        v["sourceType"] = source_type
    if doc_id:
        v["docId"] = doc_id
    return v


def test_search_similar_returns_top_k():
    """search_similar returns at most top_k results."""
    query = [1.0, 0.0]
    vectors = [
        _make_vector([1.0, 0.0], doc_id="a"),
        _make_vector([0.9, 0.1], doc_id="b"),
        _make_vector([0.5, 0.5], doc_id="c"),
        _make_vector([0.0, 1.0], doc_id="d"),
    ]
    results = search_similar(query, vectors, top_k=2)
    assert len(results) == 2


def test_search_similar_sorted_by_score():
    """Results are sorted by descending score."""
    query = [1.0, 0.0]
    vectors = [
        _make_vector([0.0, 1.0], doc_id="low"),
        _make_vector([1.0, 0.0], doc_id="high"),
        _make_vector([0.5, 0.5], doc_id="mid"),
    ]
    results = search_similar(query, vectors, top_k=3)
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)
    assert results[0]["docId"] == "high"


def test_search_similar_importance_boost():
    """High importance items get boosted above otherwise-equal items."""
    query = [1.0, 0.0]
    # Two identical embeddings, but one has high importance
    vectors = [
        _make_vector([0.9, 0.1], importance="standard", doc_id="std"),
        _make_vector([0.9, 0.1], importance="high", doc_id="high"),
    ]
    results = search_similar(query, vectors, top_k=2)
    assert results[0]["docId"] == "high"
    assert results[0]["score"] > results[1]["score"]


def test_search_similar_medium_importance_boost():
    """Medium importance gets a smaller boost than high."""
    query = [1.0, 0.0]
    vectors = [
        _make_vector([0.9, 0.1], importance="medium", doc_id="med"),
        _make_vector([0.9, 0.1], importance="high", doc_id="high"),
    ]
    results = search_similar(query, vectors, top_k=2)
    assert results[0]["docId"] == "high"


def test_search_similar_source_type_filter():
    """source_type_filter excludes non-matching items."""
    query = [1.0, 0.0]
    vectors = [
        _make_vector([1.0, 0.0], source_type="pdf", doc_id="pdf1"),
        _make_vector([0.9, 0.1], source_type="web", doc_id="web1"),
        _make_vector([0.8, 0.2], source_type="pdf", doc_id="pdf2"),
    ]
    results = search_similar(query, vectors, top_k=5, source_type_filter="pdf")
    assert len(results) == 2
    assert all(r["sourceType"] == "pdf" for r in results)


def test_search_similar_no_filter_returns_all():
    """Without filter, all source types are included."""
    query = [1.0, 0.0]
    vectors = [
        _make_vector([1.0, 0.0], source_type="pdf", doc_id="a"),
        _make_vector([0.9, 0.1], source_type="web", doc_id="b"),
    ]
    results = search_similar(query, vectors, top_k=5)
    assert len(results) == 2


def test_search_similar_empty_vectors():
    """Empty vector list returns empty results."""
    results = search_similar([1.0, 0.0], [], top_k=5)
    assert results == []


def test_search_similar_unknown_importance():
    """Unknown importance level gets 0.0 boost (default)."""
    query = [1.0, 0.0]
    vectors = [_make_vector([1.0, 0.0], importance="unknown", doc_id="x")]
    results = search_similar(query, vectors, top_k=1)
    # Score should be cosine sim + 0.0 (unknown defaults to 0.0)
    assert results[0]["score"] == pytest.approx(1.0)


def test_search_similar_score_is_rounded():
    """Scores are rounded to 4 decimal places."""
    query = [1.0, 2.0, 3.0]
    vectors = [_make_vector([4.0, 5.0, 6.0], doc_id="a")]
    results = search_similar(query, vectors, top_k=1)
    score_str = str(results[0]["score"])
    # At most 4 decimal places
    if "." in score_str:
        assert len(score_str.split(".")[1]) <= 4


def test_search_similar_missing_importance_key():
    """Vector without importance key defaults to 'standard' (0.0 boost)."""
    query = [1.0, 0.0]
    vec = {"embedding": [1.0, 0.0], "docId": "no-imp"}
    results = search_similar(query, [vec], top_k=1)
    assert results[0]["score"] == pytest.approx(1.0)


# --- get_bedrock ---


def test_get_bedrock_returns_client():
    """get_bedrock returns a bedrock-runtime client."""
    with patch("shared.embeddings.boto3") as mock_boto3:
        mock_client = MagicMock()
        mock_boto3.client.return_value = mock_client
        mock_boto3.session.Config.return_value = MagicMock()

        client = emb_mod.get_bedrock()
        assert client is mock_client
        mock_boto3.client.assert_called_once()


def test_get_bedrock_is_singleton():
    """get_bedrock returns the same instance on repeated calls."""
    with patch("shared.embeddings.boto3") as mock_boto3:
        mock_client = MagicMock()
        mock_boto3.client.return_value = mock_client
        mock_boto3.session.Config.return_value = MagicMock()

        first = emb_mod.get_bedrock()
        second = emb_mod.get_bedrock()
        assert first is second
        mock_boto3.client.assert_called_once()


# --- generate_embedding ---


def test_generate_embedding_calls_invoke_model():
    """generate_embedding invokes Bedrock with correct parameters."""
    fake_embedding = [0.1, 0.2, 0.3]
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps({"embedding": fake_embedding}).encode()

    mock_client = MagicMock()
    mock_client.invoke_model.return_value = {"body": mock_body}
    emb_mod._bedrock = mock_client

    result = generate_embedding("hello world")
    assert result == fake_embedding

    call_args = mock_client.invoke_model.call_args
    assert call_args.kwargs["modelId"] == "amazon.titan-embed-text-v2:0"
    body = json.loads(call_args.kwargs["body"])
    assert body["inputText"] == "hello world"


def test_generate_embedding_custom_model():
    """generate_embedding uses specified model_id."""
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps({"embedding": [0.5]}).encode()

    mock_client = MagicMock()
    mock_client.invoke_model.return_value = {"body": mock_body}
    emb_mod._bedrock = mock_client

    generate_embedding("test", model_id="custom-model")
    assert mock_client.invoke_model.call_args.kwargs["modelId"] == "custom-model"


def test_generate_embedding_truncates_long_text():
    """generate_embedding truncates input text to 8000 characters."""
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps({"embedding": [0.1]}).encode()

    mock_client = MagicMock()
    mock_client.invoke_model.return_value = {"body": mock_body}
    emb_mod._bedrock = mock_client

    long_text = "x" * 10000
    generate_embedding(long_text)

    body = json.loads(mock_client.invoke_model.call_args.kwargs["body"])
    assert len(body["inputText"]) == 8000


def test_generate_embedding_empty_response():
    """generate_embedding returns empty list when response has no embedding key."""
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps({}).encode()

    mock_client = MagicMock()
    mock_client.invoke_model.return_value = {"body": mock_body}
    emb_mod._bedrock = mock_client

    result = generate_embedding("test")
    assert result == []
