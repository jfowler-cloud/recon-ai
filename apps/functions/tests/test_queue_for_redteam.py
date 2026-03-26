"""Tests for queue_for_redteam handler."""

import json

from _helpers import import_handler


def test_queue_target_success(aws_env, lambda_context):
    """Queue a valid target returns 200 with target data."""
    mod = import_handler("queue_for_redteam")
    event = {
        "name": "Vulnerable Web Server",
        "description": "Found open ports on 10.0.0.5",
        "vulnerabilities": ["CVE-2024-1234", "CVE-2024-5678"],
        "category": "infrastructure",
        "sourceTicketId": "TKT-001",
    }
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200

    body = json.loads(result["body"])
    target = body["target"]
    assert target["name"] == "Vulnerable Web Server"
    assert target["status"] == "queued"
    assert target["priorityScore"] == 0
    assert target["category"] == "infrastructure"
    assert target["sourceTicketId"] == "TKT-001"
    assert len(target["vulnerabilities"]) == 2
    assert "targetId" in target

    # Verify in DynamoDB
    table = aws_env.Table("RA-Targets")
    item = table.get_item(Key={"targetId": target["targetId"]})["Item"]
    assert item["name"] == "Vulnerable Web Server"


def test_queue_target_minimal(aws_env, lambda_context):
    """Queue target with minimal fields."""
    mod = import_handler("queue_for_redteam")
    event = {"name": "Basic target", "category": "other"}
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["target"]["status"] == "queued"
    assert body["target"]["vulnerabilities"] == []
    assert "sourceTicketId" not in body["target"]


def test_queue_target_missing_name(aws_env, lambda_context):
    """Missing name returns 400."""
    mod = import_handler("queue_for_redteam")
    result = mod.handler({"category": "infrastructure"}, lambda_context)
    assert result["statusCode"] == 400
    assert "name is required" in json.loads(result["body"])["error"]


def test_queue_target_invalid_category(aws_env, lambda_context):
    """Invalid category returns 400."""
    mod = import_handler("queue_for_redteam")
    result = mod.handler({"name": "Test", "category": "invalid"}, lambda_context)
    assert result["statusCode"] == 400
    assert "Invalid category" in json.loads(result["body"])["error"]


def test_queue_target_json_body(aws_env, lambda_context):
    """Handler parses JSON string body."""
    mod = import_handler("queue_for_redteam")
    event = {
        "body": json.dumps({
            "name": "JSON body target",
            "category": "application",
        })
    }
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["target"]["name"] == "JSON body target"


def test_queue_target_default_category(aws_env, lambda_context):
    """Default category is 'other'."""
    mod = import_handler("queue_for_redteam")
    result = mod.handler({"name": "Default cat"}, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["target"]["category"] == "other"
