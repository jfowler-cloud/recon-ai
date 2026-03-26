"""Tests for update_context handler."""

import json
from unittest.mock import patch

from _helpers import import_handler


def _make_context_tables(ddb):
    """Create RA-LeadershipContext table in moto."""
    ddb.create_table(
        TableName="RA-LeadershipContext",
        KeySchema=[{"AttributeName": "contextId", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "contextId", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )


def test_update_context_success(aws_env, lambda_context):
    """Save leadership context returns 200."""
    _make_context_tables(aws_env)
    mod = import_handler("update_context")
    event = {
        "goals": [{"id": "g1", "title": "Improve coverage"}],
        "kpis": [{"id": "k1", "title": "Vulnerability closure rate"}],
        "priorityWeights": {"alignment": 0.40, "impact": 0.30, "effort": 0.20, "urgency": 0.10},
        "planningWindow": "Q2 2026",
    }
    with patch.object(mod.sfn_client, "start_execution"):
        result = mod.handler(event, lambda_context)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    ctx = body["context"]
    assert ctx["goals"] == event["goals"]
    assert ctx["kpis"] == event["kpis"]
    assert ctx["planningWindow"] == "Q2 2026"
    assert "contextId" in ctx

    # Verify CONFIG pointer
    table = aws_env.Table("RA-LeadershipContext")
    config_item = table.get_item(Key={"contextId": "CONFIG"})["Item"]
    assert config_item["activeContextId"] == ctx["contextId"]


def test_update_context_goals_only(aws_env, lambda_context):
    """Goals without KPIs is valid."""
    _make_context_tables(aws_env)
    mod = import_handler("update_context")
    event = {"goals": [{"id": "g1", "title": "Test"}]}
    with patch.object(mod.sfn_client, "start_execution"):
        result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200


def test_update_context_missing_goals_and_kpis(aws_env, lambda_context):
    """Both goals and kpis empty returns 400."""
    _make_context_tables(aws_env)
    mod = import_handler("update_context")
    result = mod.handler({}, lambda_context)
    assert result["statusCode"] == 400
    assert "goals or kpis" in json.loads(result["body"])["error"]


def test_update_context_invalid_weight_keys(aws_env, lambda_context):
    """Invalid priorityWeights keys returns 400."""
    _make_context_tables(aws_env)
    mod = import_handler("update_context")
    event = {
        "goals": [{"id": "g1", "title": "Test"}],
        "priorityWeights": {"alignment": 0.5, "wrong": 0.5},
    }
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 400
    assert "priorityWeights must contain" in json.loads(result["body"])["error"]


def test_update_context_weights_sum_invalid(aws_env, lambda_context):
    """Weights not summing to ~1.0 returns 400."""
    _make_context_tables(aws_env)
    mod = import_handler("update_context")
    event = {
        "goals": [{"id": "g1", "title": "Test"}],
        "priorityWeights": {"alignment": 0.50, "impact": 0.50, "effort": 0.50, "urgency": 0.50},
    }
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 400
    assert "sum to ~1.0" in json.loads(result["body"])["error"]


def test_update_context_default_weights(aws_env, lambda_context):
    """No priorityWeights uses defaults."""
    _make_context_tables(aws_env)
    mod = import_handler("update_context")
    event = {"goals": [{"id": "g1", "title": "Test"}]}
    with patch.object(mod.sfn_client, "start_execution"):
        result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    weights = body["context"]["priorityWeights"]
    assert abs(weights["alignment"] - 0.40) < 0.001


def test_update_context_json_body(aws_env, lambda_context):
    """Handler parses JSON string body."""
    _make_context_tables(aws_env)
    mod = import_handler("update_context")
    event = {
        "body": json.dumps({
            "goals": [{"id": "g1", "title": "JSON test"}],
            "kpis": [{"id": "k1", "title": "Metric"}],
        })
    }
    with patch.object(mod.sfn_client, "start_execution"):
        result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200


def test_update_context_starts_prioritization(aws_env, lambda_context, monkeypatch):
    """Handler starts prioritization workflow when ARN is set."""
    _make_context_tables(aws_env)
    mod = import_handler("update_context")
    monkeypatch.setenv("PRIORITIZATION_WORKFLOW_ARN", "arn:aws:states:us-east-1:123:stateMachine:RA-PrioritizationWorkflow")
    mod = import_handler("update_context")

    event = {"goals": [{"id": "g1", "title": "Test"}]}
    with patch.object(mod.sfn_client, "start_execution") as mock_sfn:
        result = mod.handler(event, lambda_context)

    assert result["statusCode"] == 200
    mock_sfn.assert_called_once()
