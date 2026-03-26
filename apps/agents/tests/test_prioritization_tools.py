"""Tests for prioritization tools module."""

import importlib.util
import os
import sys
import time
from decimal import Decimal
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

_agents_dir = Path(__file__).resolve().parent.parent


def _import_prioritization_tools():
    """Import prioritization/tools.py with a unique module name to avoid collisions."""
    import shared.db as db_mod
    db_mod._dynamodb = None
    tools_path = _agents_dir / "prioritization" / "tools.py"
    spec = importlib.util.spec_from_file_location("prioritization_tools", tools_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(autouse=True)
def _set_env(monkeypatch):
    """Set required environment variables."""
    monkeypatch.setenv("TARGETS_TABLE", "RA-Targets")
    monkeypatch.setenv("LEADERSHIP_CONTEXT_TABLE", "RA-LeadershipContext")
    monkeypatch.setenv("SCORING_HISTORY_TABLE", "RA-ScoringHistory")
    monkeypatch.setenv("PRIORITIZATION_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")


@pytest.fixture
def targets_table(dynamodb_resource):
    """Create RA-Targets table."""
    dynamodb_resource.create_table(
        TableName="RA-Targets",
        KeySchema=[{"AttributeName": "targetId", "KeyType": "HASH"}],
        AttributeDefinitions=[
            {"AttributeName": "targetId", "AttributeType": "S"},
            {"AttributeName": "status", "AttributeType": "S"},
            {"AttributeName": "priorityScore", "AttributeType": "N"},
        ],
        GlobalSecondaryIndexes=[
            {"IndexName": "StatusIndex", "KeySchema": [{"AttributeName": "status", "KeyType": "HASH"}, {"AttributeName": "priorityScore", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    return dynamodb_resource.Table("RA-Targets")


@pytest.fixture
def context_table(dynamodb_resource):
    """Create RA-LeadershipContext table."""
    dynamodb_resource.create_table(
        TableName="RA-LeadershipContext",
        KeySchema=[{"AttributeName": "contextId", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "contextId", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )
    return dynamodb_resource.Table("RA-LeadershipContext")


@pytest.fixture
def scoring_table(dynamodb_resource):
    """Create RA-ScoringHistory table."""
    dynamodb_resource.create_table(
        TableName="RA-ScoringHistory",
        KeySchema=[{"AttributeName": "runId", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "runId", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )
    return dynamodb_resource.Table("RA-ScoringHistory")


def test_get_all_active_targets_empty(targets_table):
    """No active targets returns empty list."""
    tools = _import_prioritization_tools()
    result = tools.get_all_active_targets()
    assert result == []


def test_get_all_active_targets_returns_active(targets_table):
    """Returns targets with active statuses only."""
    tools = _import_prioritization_tools()
    now = int(time.time())
    targets_table.put_item(Item={"targetId": "t-1", "status": "enriched", "priorityScore": 50, "createdAt": now, "updatedAt": now})
    targets_table.put_item(Item={"targetId": "t-2", "status": "queued", "priorityScore": 0, "createdAt": now, "updatedAt": now})
    targets_table.put_item(Item={"targetId": "t-3", "status": "completed", "priorityScore": 80, "createdAt": now, "updatedAt": now})

    result = tools.get_all_active_targets()
    ids = {t["targetId"] for t in result}
    assert "t-1" in ids
    assert "t-2" in ids
    assert "t-3" not in ids  # completed is not active


def test_get_all_active_targets_deduplicates(targets_table):
    """No duplicates even if target appears in multiple queries."""
    tools = _import_prioritization_tools()
    now = int(time.time())
    targets_table.put_item(Item={"targetId": "t-1", "status": "enriched", "priorityScore": 50, "createdAt": now, "updatedAt": now})
    result = tools.get_all_active_targets()
    assert len(result) == 1


def test_get_leadership_context_empty(context_table):
    """No CONFIG pointer returns default context."""
    tools = _import_prioritization_tools()
    result = tools.get_leadership_context()
    assert result["priorityWeights"]["alignment"] == 0.40


def test_get_leadership_context_with_data(context_table):
    """Returns active context with priority weights."""
    tools = _import_prioritization_tools()
    context_table.put_item(Item={
        "contextId": "ctx-456",
        "goals": [{"id": "g1", "title": "Coverage"}],
        "kpis": [{"id": "k1", "title": "Closure rate"}],
        "priorityWeights": {"alignment": Decimal("0.50"), "impact": Decimal("0.20"), "effort": Decimal("0.20"), "urgency": Decimal("0.10")},
        "planningWindow": "Q3 2026",
    })
    context_table.put_item(Item={"contextId": "CONFIG", "activeContextId": "ctx-456"})

    result = tools.get_leadership_context()
    assert result["contextId"] == "ctx-456"
    assert result["priorityWeights"]["alignment"] == Decimal("0.50")


def test_update_target_scores(targets_table):
    """Batch update priority scores on targets."""
    tools = _import_prioritization_tools()
    now = int(time.time())
    targets_table.put_item(Item={"targetId": "t-1", "status": "enriched", "priorityScore": 0, "createdAt": now, "updatedAt": now})
    targets_table.put_item(Item={"targetId": "t-2", "status": "enriched", "priorityScore": 0, "createdAt": now, "updatedAt": now})

    updates = [
        {"targetId": "t-1", "priorityScore": 85, "alignmentScore": 90, "urgencyScore": 60, "goalAlignment": ["g1"], "alignmentTags": ["coverage"]},
        {"targetId": "t-2", "priorityScore": 45, "alignmentScore": 40, "urgencyScore": 30, "goalAlignment": [], "alignmentTags": []},
    ]
    result = tools.update_target_scores(updates)
    assert "Updated scores for 2 targets" in result

    item1 = targets_table.get_item(Key={"targetId": "t-1"})["Item"]
    assert item1["priorityScore"] == 85
    assert item1["alignmentScore"] == 90

    item2 = targets_table.get_item(Key={"targetId": "t-2"})["Item"]
    assert item2["priorityScore"] == 45


def test_update_target_scores_clamps(targets_table):
    """Scores are clamped to 0-100 range."""
    tools = _import_prioritization_tools()
    now = int(time.time())
    targets_table.put_item(Item={"targetId": "t-1", "status": "enriched", "priorityScore": 0, "createdAt": now, "updatedAt": now})

    updates = [{"targetId": "t-1", "priorityScore": 150, "alignmentScore": 0, "urgencyScore": 0}]
    tools.update_target_scores(updates)

    item = targets_table.get_item(Key={"targetId": "t-1"})["Item"]
    assert item["priorityScore"] == 100


def test_submit_ranking_results(scoring_table):
    """Save ranking audit record to ScoringHistory."""
    tools = _import_prioritization_tools()
    result = tools.submit_ranking_results(
        run_id="run-001",
        context_id="ctx-123",
        ranked_targets=[{"targetId": "t-1", "priorityScore": 85}],
        triggered_by="context_update",
        duration_ms=1500,
    )
    assert "1 targets scored" in result

    item = scoring_table.get_item(Key={"runId": "run-001"})["Item"]
    assert item["contextId"] == "ctx-123"
    assert item["targetsScored"] == 1
    assert item["triggeredBy"] == "context_update"
    assert "expiresAt" in item
