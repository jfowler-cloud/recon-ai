"""Tests for record_tool_action handler."""

import json

from _helpers import import_handler


def _make_tool_actions_table(ddb):
    """Create RA-ToolActions table in moto."""
    ddb.create_table(
        TableName="RA-ToolActions",
        KeySchema=[
            {"AttributeName": "ticketId", "KeyType": "HASH"},
            {"AttributeName": "actionId", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "ticketId", "AttributeType": "S"},
            {"AttributeName": "actionId", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


def test_record_tool_action_success(aws_env, lambda_context):
    """Record a valid tool action returns 200."""
    _make_tool_actions_table(aws_env)
    mod = import_handler("record_tool_action")
    event = {
        "ticketId": "TKT-001",
        "toolName": "nmap",
        "toolVersion": "7.94",
        "command": "nmap -sS -sV 10.0.0.0/24",
        "parameters": {"flags": "-sS -sV", "target": "10.0.0.0/24"},
        "targetHost": "10.0.0.0/24",
        "result": "Found 3 open ports",
        "resultStatus": "success",
        "executedBy": "operator-1",
    }
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200

    body = json.loads(result["body"])
    action = body["action"]
    assert action["ticketId"] == "TKT-001"
    assert action["toolName"] == "nmap"
    assert action["toolVersion"] == "7.94"
    assert action["executionType"] == "manual"
    assert action["resultStatus"] == "success"
    assert "actionId" in action
    assert "createdAt" in action

    # Verify in DynamoDB
    table = aws_env.Table("RA-ToolActions")
    item = table.get_item(Key={"ticketId": "TKT-001", "actionId": action["actionId"]})["Item"]
    assert item["toolName"] == "nmap"


def test_record_tool_action_minimal(aws_env, lambda_context):
    """Record action with minimal required fields."""
    _make_tool_actions_table(aws_env)
    mod = import_handler("record_tool_action")
    event = {"ticketId": "TKT-002", "toolName": "gobuster"}
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["action"]["resultStatus"] == "pending"
    assert body["action"]["executionType"] == "manual"


def test_record_tool_action_missing_ticket_id(aws_env, lambda_context):
    """Missing ticketId returns 400."""
    _make_tool_actions_table(aws_env)
    mod = import_handler("record_tool_action")
    result = mod.handler({"toolName": "nmap"}, lambda_context)
    assert result["statusCode"] == 400
    assert "ticketId is required" in json.loads(result["body"])["error"]


def test_record_tool_action_missing_tool_name(aws_env, lambda_context):
    """Missing toolName returns 400."""
    _make_tool_actions_table(aws_env)
    mod = import_handler("record_tool_action")
    result = mod.handler({"ticketId": "TKT-001"}, lambda_context)
    assert result["statusCode"] == 400
    assert "toolName is required" in json.loads(result["body"])["error"]


def test_record_tool_action_invalid_status(aws_env, lambda_context):
    """Invalid resultStatus returns 400."""
    _make_tool_actions_table(aws_env)
    mod = import_handler("record_tool_action")
    event = {"ticketId": "TKT-001", "toolName": "nmap", "resultStatus": "invalid"}
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 400
    assert "Invalid resultStatus" in json.loads(result["body"])["error"]


def test_record_tool_action_json_body(aws_env, lambda_context):
    """Handler parses JSON string body."""
    _make_tool_actions_table(aws_env)
    mod = import_handler("record_tool_action")
    event = {
        "body": json.dumps({
            "ticketId": "TKT-003",
            "toolName": "metasploit",
            "resultStatus": "failure",
        })
    }
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["action"]["toolName"] == "metasploit"
    assert body["action"]["resultStatus"] == "failure"
