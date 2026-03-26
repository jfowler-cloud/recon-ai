"""Tests for create_ticket handler."""

import json

from _helpers import import_handler


def test_create_ticket_success(aws_env, lambda_context):
    """Create a valid ticket returns 200 with ticket data."""
    mod = import_handler("create_ticket")
    event = {
        "title": "Investigate suspicious IP",
        "description": "Found anomalous traffic from 10.0.0.1",
        "ticketType": "osint-investigation",
        "severity": "high",
        "assigneeId": "analyst-1",
    }
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200

    body = json.loads(result["body"])
    ticket = body["ticket"]
    assert ticket["title"] == "Investigate suspicious IP"
    assert ticket["ticketType"] == "osint-investigation"
    assert ticket["severity"] == "high"
    assert ticket["status"] == "new"
    assert ticket["assigneeId"] == "analyst-1"
    assert "ticketId" in ticket
    assert "createdAt" in ticket
    assert "updatedAt" in ticket

    # Verify ticket note was created
    notes_table = aws_env.Table("RA-TicketNotes")
    notes_resp = notes_table.query(
        KeyConditionExpression="ticketId = :tid",
        ExpressionAttributeValues={":tid": ticket["ticketId"]},
    )
    assert len(notes_resp["Items"]) == 1
    assert notes_resp["Items"][0]["noteType"] == "status-change"
    assert notes_resp["Items"][0]["content"] == "Ticket created"


def test_create_ticket_with_target(aws_env, lambda_context):
    """Create a ticket with optional targetId."""
    mod = import_handler("create_ticket")
    event = {
        "title": "Red team op",
        "ticketType": "red-team-operation",
        "severity": "critical",
        "targetId": "target-123",
    }
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["ticket"]["targetId"] == "target-123"


def test_create_ticket_missing_title(aws_env, lambda_context):
    """Missing title returns 400."""
    mod = import_handler("create_ticket")
    event = {"ticketType": "osint-investigation", "severity": "high"}
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 400
    assert "title is required" in json.loads(result["body"])["error"]


def test_create_ticket_invalid_type(aws_env, lambda_context):
    """Invalid ticketType returns 400."""
    mod = import_handler("create_ticket")
    event = {"title": "Test", "ticketType": "invalid", "severity": "high"}
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 400
    assert "Invalid ticketType" in json.loads(result["body"])["error"]


def test_create_ticket_invalid_severity(aws_env, lambda_context):
    """Invalid severity returns 400."""
    mod = import_handler("create_ticket")
    event = {"title": "Test", "ticketType": "osint-investigation", "severity": "extreme"}
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 400
    assert "Invalid severity" in json.loads(result["body"])["error"]


def test_create_ticket_json_body(aws_env, lambda_context):
    """Handler parses JSON string body."""
    mod = import_handler("create_ticket")
    event = {
        "body": json.dumps({
            "title": "JSON body test",
            "ticketType": "escalation",
            "severity": "low",
        })
    }
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["ticket"]["title"] == "JSON body test"
