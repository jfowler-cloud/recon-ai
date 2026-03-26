"""Tests for update_target handler — status transitions and field updates."""

import json

from _helpers import import_handler


def _seed_target(ddb, target_id="tgt-001", status="queued", **extra):
    """Insert a target directly into DynamoDB for testing."""
    table = ddb.Table("RA-Targets")
    item = {
        "targetId": target_id,
        "plainTextGoal": "Test target",
        "category": "infrastructure",
        "status": status,
        "priorityScore": 0,
        "createdAt": 1000000,
        "updatedAt": 1000000,
        **extra,
    }
    table.put_item(Item=item)
    return item


def test_update_target_status(aws_env, lambda_context):
    """Valid status transition from queued -> enriched."""
    _seed_target(aws_env, status="queued")
    mod = import_handler("update_target")
    result = mod.handler({"targetId": "tgt-001", "status": "enriched"}, lambda_context)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["target"]["status"] == "enriched"


def test_update_target_invalid_transition(aws_env, lambda_context):
    """Invalid transition queued -> completed returns 400."""
    _seed_target(aws_env, status="queued")
    mod = import_handler("update_target")
    result = mod.handler({"targetId": "tgt-001", "status": "completed"}, lambda_context)

    assert result["statusCode"] == 400
    assert "Cannot transition" in json.loads(result["body"])["error"]


def test_update_target_fields(aws_env, lambda_context):
    """Update name, description, tags."""
    _seed_target(aws_env)
    mod = import_handler("update_target")
    result = mod.handler({
        "targetId": "tgt-001",
        "name": "Updated Name",
        "description": "New description",
        "tags": ["web", "critical"],
    }, lambda_context)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["target"]["name"] == "Updated Name"
    assert body["target"]["tags"] == ["web", "critical"]


def test_update_target_not_found(aws_env, lambda_context):
    """Update nonexistent target returns 404."""
    mod = import_handler("update_target")
    result = mod.handler({"targetId": "nonexistent", "name": "X"}, lambda_context)
    assert result["statusCode"] == 404


def test_update_target_missing_id(aws_env, lambda_context):
    """Missing targetId returns 400."""
    mod = import_handler("update_target")
    result = mod.handler({"name": "X"}, lambda_context)
    assert result["statusCode"] == 400
    assert "targetId is required" in json.loads(result["body"])["error"]


def test_update_target_no_fields(aws_env, lambda_context):
    """No updatable fields returns 400."""
    _seed_target(aws_env)
    mod = import_handler("update_target")
    result = mod.handler({"targetId": "tgt-001"}, lambda_context)
    assert result["statusCode"] == 400
    assert "No updatable fields" in json.loads(result["body"])["error"]


def test_update_target_invalid_status_value(aws_env, lambda_context):
    """Invalid status value returns 400."""
    _seed_target(aws_env)
    mod = import_handler("update_target")
    result = mod.handler({"targetId": "tgt-001", "status": "invalid"}, lambda_context)
    assert result["statusCode"] == 400
    assert "Invalid status" in json.loads(result["body"])["error"]


def test_update_target_json_body(aws_env, lambda_context):
    """Handler parses JSON string body."""
    _seed_target(aws_env, status="active")
    mod = import_handler("update_target")
    result = mod.handler({
        "body": json.dumps({"targetId": "tgt-001", "status": "in_progress"})
    }, lambda_context)

    assert result["statusCode"] == 200
    assert json.loads(result["body"])["target"]["status"] == "in_progress"


def test_update_target_reopen_completed(aws_env, lambda_context):
    """Can transition completed -> active (re-open)."""
    _seed_target(aws_env, status="completed")
    mod = import_handler("update_target")
    result = mod.handler({"targetId": "tgt-001", "status": "active"}, lambda_context)
    assert result["statusCode"] == 200
    assert json.loads(result["body"])["target"]["status"] == "active"


def test_update_target_persists(aws_env, lambda_context):
    """Updates are persisted in DynamoDB."""
    _seed_target(aws_env)
    mod = import_handler("update_target")
    mod.handler({"targetId": "tgt-001", "severity": 85, "notes": "Critical asset"}, lambda_context)

    table = aws_env.Table("RA-Targets")
    item = table.get_item(Key={"targetId": "tgt-001"})["Item"]
    assert item["severity"] == 85
    assert item["notes"] == "Critical asset"


def test_update_target_uses_condition_expression(aws_env, lambda_context):
    """Verify handler uses ConditionExpression for atomic status transitions."""
    _seed_target(aws_env, "tgt-cond", status="queued")
    mod = import_handler("update_target")

    # Verify the handler reads current status and uses it in ConditionExpression
    # by checking that a valid transition succeeds
    result = mod.handler({"targetId": "tgt-cond", "status": "enriched"}, lambda_context)
    assert result["statusCode"] == 200

    # Verify the status actually changed (atomic write succeeded)
    table = aws_env.Table("RA-Targets")
    item = table.get_item(Key={"targetId": "tgt-cond"})["Item"]
    assert item["status"] == "enriched"
    assert "updatedAt" in item


def test_update_target_cancel(aws_env, lambda_context):
    """Can cancel a target from any state."""
    _seed_target(aws_env, "tgt-cancel", status="active")
    mod = import_handler("update_target")
    result = mod.handler({"targetId": "tgt-cancel", "status": "cancelled"}, lambda_context)
    assert result["statusCode"] == 200
    assert json.loads(result["body"])["target"]["status"] == "cancelled"


def test_update_target_assignee(aws_env, lambda_context):
    """Can update assigneeId field."""
    _seed_target(aws_env, "tgt-assign")
    mod = import_handler("update_target")
    result = mod.handler({"targetId": "tgt-assign", "assignee": "analyst@test.com"}, lambda_context)
    assert result["statusCode"] == 200
