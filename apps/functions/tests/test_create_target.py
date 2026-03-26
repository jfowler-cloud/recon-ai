"""Tests for create_target handler."""

import json
from unittest.mock import patch, MagicMock

from _helpers import import_handler


def test_create_target_success(aws_env, lambda_context):
    """Create a valid target returns 200 with target data."""
    mod = import_handler("create_target")
    event = {
        "plainTextGoal": "Compromise the internal wiki server to demonstrate lateral movement risk",
        "category": "infrastructure",
        "createdBy": "analyst-1",
    }
    with patch.object(mod.sfn_client, "start_execution"):
        result = mod.handler(event, lambda_context)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    target = body["target"]
    assert target["plainTextGoal"] == event["plainTextGoal"]
    assert target["category"] == "infrastructure"
    assert target["status"] == "queued"
    assert target["priorityScore"] == 0
    assert target["createdBy"] == "analyst-1"
    assert "targetId" in target
    assert "createdAt" in target

    # Verify in DynamoDB
    table = aws_env.Table("RA-Targets")
    item = table.get_item(Key={"targetId": target["targetId"]})["Item"]
    assert item["plainTextGoal"] == event["plainTextGoal"]


def test_create_target_default_category(aws_env, lambda_context):
    """Default category is 'other'."""
    mod = import_handler("create_target")
    event = {"plainTextGoal": "Test goal"}
    with patch.object(mod.sfn_client, "start_execution"):
        result = mod.handler(event, lambda_context)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["target"]["category"] == "other"


def test_create_target_missing_goal(aws_env, lambda_context):
    """Missing plainTextGoal returns 400."""
    mod = import_handler("create_target")
    result = mod.handler({"category": "infrastructure"}, lambda_context)
    assert result["statusCode"] == 400
    assert "plainTextGoal is required" in json.loads(result["body"])["error"]


def test_create_target_invalid_category(aws_env, lambda_context):
    """Invalid category returns 400."""
    mod = import_handler("create_target")
    result = mod.handler({"plainTextGoal": "Test", "category": "invalid"}, lambda_context)
    assert result["statusCode"] == 400
    assert "Invalid category" in json.loads(result["body"])["error"]


def test_create_target_json_body(aws_env, lambda_context):
    """Handler parses JSON string body."""
    mod = import_handler("create_target")
    event = {
        "body": json.dumps({
            "plainTextGoal": "JSON body test",
            "category": "application",
        })
    }
    with patch.object(mod.sfn_client, "start_execution"):
        result = mod.handler(event, lambda_context)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["target"]["plainTextGoal"] == "JSON body test"


def test_create_target_starts_workflow(aws_env, lambda_context, monkeypatch):
    """Handler starts enrichment workflow when ARN is set."""
    mod = import_handler("create_target")
    monkeypatch.setenv("ENRICHMENT_WORKFLOW_ARN", "arn:aws:states:us-east-1:123:stateMachine:RA-EnrichmentWorkflow")
    # Re-import to pick up env var
    mod = import_handler("create_target")

    event = {"plainTextGoal": "Workflow test goal"}
    with patch.object(mod.sfn_client, "start_execution") as mock_sfn:
        result = mod.handler(event, lambda_context)

    assert result["statusCode"] == 200
    mock_sfn.assert_called_once()
    call_kwargs = mock_sfn.call_args.kwargs
    assert "RA-EnrichmentWorkflow" in call_kwargs["stateMachineArn"]


def test_create_target_workflow_failure_non_blocking(aws_env, lambda_context, monkeypatch):
    """Workflow start failure does not block target creation."""
    mod = import_handler("create_target")
    monkeypatch.setenv("ENRICHMENT_WORKFLOW_ARN", "arn:aws:states:us-east-1:123:stateMachine:RA-EnrichmentWorkflow")
    mod = import_handler("create_target")

    event = {"plainTextGoal": "Failure test"}
    with patch.object(mod.sfn_client, "start_execution", side_effect=Exception("SFN error")):
        result = mod.handler(event, lambda_context)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert "targetId" in body["target"]
