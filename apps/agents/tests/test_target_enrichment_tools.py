"""Tests for target_enrichment tools module."""

import importlib.util
import os
import sys
import time
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

_agents_dir = Path(__file__).resolve().parent.parent


def _import_enrichment_tools():
    """Import target_enrichment/tools.py with a unique module name to avoid collisions."""
    import shared.db as db_mod
    db_mod._dynamodb = None
    tools_path = _agents_dir / "target_enrichment" / "tools.py"
    spec = importlib.util.spec_from_file_location("enrichment_tools", tools_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(autouse=True)
def _set_env(monkeypatch):
    """Set required environment variables."""
    monkeypatch.setenv("TARGETS_TABLE", "RA-Targets")
    monkeypatch.setenv("LEADERSHIP_CONTEXT_TABLE", "RA-LeadershipContext")
    monkeypatch.setenv("ENRICHMENT_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
    monkeypatch.setenv("SCORING_HISTORY_TABLE", "RA-ScoringHistory")


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


def test_get_leadership_context_empty(context_table):
    """No CONFIG pointer returns empty context."""
    tools = _import_enrichment_tools()
    result = tools.get_leadership_context()
    assert result == {"goals": [], "kpis": [], "planningWindow": ""}


def test_get_leadership_context_with_data(context_table):
    """Returns active context when CONFIG pointer exists."""
    tools = _import_enrichment_tools()
    context_table.put_item(Item={
        "contextId": "ctx-123",
        "goals": [{"id": "g1", "title": "Improve coverage"}],
        "kpis": [{"id": "k1", "title": "Vuln closure rate"}],
        "planningWindow": "Q2 2026",
    })
    context_table.put_item(Item={
        "contextId": "CONFIG",
        "activeContextId": "ctx-123",
    })
    result = tools.get_leadership_context()
    assert len(result["goals"]) == 1
    assert result["planningWindow"] == "Q2 2026"


def test_save_enriched_target_success(targets_table):
    """Save enriched target updates the target record."""
    tools = _import_enrichment_tools()
    targets_table.put_item(Item={
        "targetId": "t-001",
        "plainTextGoal": "Test goal",
        "status": "queued",
        "priorityScore": 0,
        "createdAt": int(time.time()),
        "updatedAt": int(time.time()),
    })

    result = tools.save_enriched_target(
        target_id="t-001",
        name="Compromised Wiki Server",
        description="Internal wiki with default creds",
        category="infrastructure",
        vulnerabilities=["CVE-2024-1234"],
        effort="medium",
        severity_score=75,
        goal_alignment=["g1"],
        alignment_tags=["coverage"],
    )
    assert "Enriched target t-001" in result

    item = targets_table.get_item(Key={"targetId": "t-001"})["Item"]
    assert item["name"] == "Compromised Wiki Server"
    assert item["status"] == "enriched"
    assert item["effortScore"] == 50
    assert item["severityScore"] == 75


def test_save_enriched_target_idempotent(targets_table):
    """Second enrichment attempt is skipped (idempotent)."""
    tools = _import_enrichment_tools()
    now = int(time.time())
    targets_table.put_item(Item={
        "targetId": "t-002",
        "plainTextGoal": "Test",
        "status": "enriched",
        "enrichedAt": now,
        "priorityScore": 0,
        "createdAt": now,
        "updatedAt": now,
    })

    result = tools.save_enriched_target(
        target_id="t-002",
        name="Duplicate",
        description="Should not overwrite",
        category="application",
        vulnerabilities=[],
        effort="small",
        severity_score=50,
        goal_alignment=[],
        alignment_tags=[],
    )
    assert "already enriched" in result
