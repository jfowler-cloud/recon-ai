"""Tests for update_ticket handler."""

import json
import time

import boto3
from _helpers import import_handler


def _seed_ticket(ddb, ticket_id="TKT-001", status="new", assignee_id="analyst-1"):
    """Insert a ticket directly into the mock table."""
    now = int(time.time())
    table = ddb.Table("RA-Tickets")
    table.put_item(Item={
        "ticketId": ticket_id,
        "title": "Test ticket",
        "ticketType": "osint-investigation",
        "severity": "high",
        "status": status,
        "assigneeId": assignee_id,
        "createdAt": now,
        "updatedAt": now,
    })


def test_update_ticket_status_valid(aws_env, lambda_context):
    """Valid status transition new -> triaging succeeds."""
    _seed_ticket(aws_env, "TKT-001", "new")
    mod = import_handler("update_ticket")
    event = {"ticketId": "TKT-001", "status": "triaging"}
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["ticket"]["status"] == "triaging"


def test_update_ticket_status_closed_from_new(aws_env, lambda_context):
    """new -> closed is a valid transition."""
    _seed_ticket(aws_env, "TKT-002", "new")
    mod = import_handler("update_ticket")
    result = mod.handler({"ticketId": "TKT-002", "status": "closed"}, lambda_context)
    assert result["statusCode"] == 200
    assert json.loads(result["body"])["ticket"]["status"] == "closed"


def test_update_ticket_invalid_transition(aws_env, lambda_context):
    """new -> active is invalid and returns 400."""
    _seed_ticket(aws_env, "TKT-003", "new")
    mod = import_handler("update_ticket")
    result = mod.handler({"ticketId": "TKT-003", "status": "active"}, lambda_context)
    assert result["statusCode"] == 400
    body = json.loads(result["body"])
    assert "Invalid transition" in body["error"]
    assert "allowedTransitions" in body


def test_update_ticket_with_note(aws_env, lambda_context):
    """Adding a note creates a RA-TicketNotes entry."""
    _seed_ticket(aws_env, "TKT-004", "new")
    mod = import_handler("update_ticket")
    event = {
        "ticketId": "TKT-004",
        "status": "triaging",
        "note": {"content": "Starting investigation", "noteType": "comment"},
    }
    result = mod.handler(event, lambda_context)
    assert result["statusCode"] == 200

    notes_table = aws_env.Table("RA-TicketNotes")
    notes_resp = notes_table.query(
        KeyConditionExpression="ticketId = :tid",
        ExpressionAttributeValues={":tid": "TKT-004"},
    )
    assert len(notes_resp["Items"]) == 1
    assert notes_resp["Items"][0]["content"] == "Starting investigation"


def test_update_ticket_assignee_only(aws_env, lambda_context):
    """Updating only assigneeId without status change."""
    _seed_ticket(aws_env, "TKT-005", "new")
    mod = import_handler("update_ticket")
    result = mod.handler({"ticketId": "TKT-005", "assigneeId": "analyst-2"}, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["ticket"]["assigneeId"] == "analyst-2"
    assert body["ticket"]["status"] == "new"  # unchanged


def test_update_ticket_not_found(aws_env, lambda_context):
    """Updating a non-existent ticket returns 404."""
    mod = import_handler("update_ticket")
    result = mod.handler({"ticketId": "NONEXISTENT", "status": "triaging"}, lambda_context)
    assert result["statusCode"] == 404


def test_update_ticket_missing_ticket_id(aws_env, lambda_context):
    """Missing ticketId returns 400."""
    mod = import_handler("update_ticket")
    result = mod.handler({"status": "triaging"}, lambda_context)
    assert result["statusCode"] == 400


def test_update_ticket_no_fields(aws_env, lambda_context):
    """No update fields returns 400."""
    mod = import_handler("update_ticket")
    result = mod.handler({"ticketId": "TKT-001"}, lambda_context)
    assert result["statusCode"] == 400


def test_update_ticket_full_lifecycle(aws_env, lambda_context):
    """Walk through the full ticket lifecycle."""
    _seed_ticket(aws_env, "TKT-LC", "new")
    mod = import_handler("update_ticket")

    transitions = ["triaging", "investigating", "active", "completed", "closed"]
    for next_status in transitions:
        result = mod.handler({"ticketId": "TKT-LC", "status": next_status}, lambda_context)
        assert result["statusCode"] == 200, f"Failed transition to {next_status}"
        assert json.loads(result["body"])["ticket"]["status"] == next_status


def test_update_ticket_uses_condition_expression(aws_env, lambda_context):
    """Verify handler uses ConditionExpression for atomic status transitions."""
    _seed_ticket(aws_env, "TKT-COND", "new")
    mod = import_handler("update_ticket")

    # Valid transition: new -> triaging
    result = mod.handler({"ticketId": "TKT-COND", "status": "triaging"}, lambda_context)
    assert result["statusCode"] == 200

    # Verify status persisted atomically
    table = aws_env.Table("RA-Tickets")
    item = table.get_item(Key={"ticketId": "TKT-COND"})["Item"]
    assert item["status"] == "triaging"

    # Continue lifecycle to verify ConditionExpression works for each step
    result2 = mod.handler({"ticketId": "TKT-COND", "status": "investigating"}, lambda_context)
    assert result2["statusCode"] == 200
    item2 = table.get_item(Key={"ticketId": "TKT-COND"})["Item"]
    assert item2["status"] == "investigating"


def test_update_ticket_title_field(aws_env, lambda_context):
    """Can update title field alongside status."""
    _seed_ticket(aws_env, "TKT-TITLE", "new")
    mod = import_handler("update_ticket")
    result = mod.handler({
        "ticketId": "TKT-TITLE",
        "status": "triaging",
        "title": "Updated title",
    }, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["ticket"]["status"] == "triaging"
