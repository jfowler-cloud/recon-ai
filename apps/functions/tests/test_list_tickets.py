"""Tests for list_tickets handler."""

import json
import time

from _helpers import import_handler


def _seed_tickets(ddb, count=5):
    """Insert multiple tickets into the mock table."""
    table = ddb.Table("RA-Tickets")
    base_time = int(time.time())
    for i in range(count):
        table.put_item(Item={
            "ticketId": f"TKT-{i:03d}",
            "title": f"Ticket {i}",
            "ticketType": "osint-investigation" if i % 2 == 0 else "red-team-operation",
            "severity": "high",
            "status": "new" if i < 3 else "triaging",
            "assigneeId": "analyst-1" if i < 3 else "analyst-2",
            "targetId": f"TGT-{i:03d}" if i % 3 == 0 else "none",
            "createdAt": base_time + i,
            "updatedAt": base_time + i,
        })


def test_list_tickets_scan_all(aws_env, lambda_context):
    """Scan all tickets with no filter."""
    _seed_tickets(aws_env, 5)
    mod = import_handler("list_tickets")
    result = mod.handler({}, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["count"] == 5


def test_list_tickets_by_owner(aws_env, lambda_context):
    """Query tickets by owner GSI."""
    _seed_tickets(aws_env, 5)
    mod = import_handler("list_tickets")
    result = mod.handler({"queryBy": "owner", "queryValue": "analyst-1"}, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["count"] == 3
    assert all(t["assigneeId"] == "analyst-1" for t in body["tickets"])


def test_list_tickets_by_status(aws_env, lambda_context):
    """Query tickets by status GSI."""
    _seed_tickets(aws_env, 5)
    mod = import_handler("list_tickets")
    result = mod.handler({"queryBy": "status", "queryValue": "triaging"}, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["count"] == 2
    assert all(t["status"] == "triaging" for t in body["tickets"])


def test_list_tickets_by_type(aws_env, lambda_context):
    """Query tickets by type GSI."""
    _seed_tickets(aws_env, 5)
    mod = import_handler("list_tickets")
    result = mod.handler({"queryBy": "type", "queryValue": "osint-investigation"}, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["count"] == 3  # indices 0, 2, 4


def test_list_tickets_by_target(aws_env, lambda_context):
    """Query tickets by target GSI."""
    _seed_tickets(aws_env, 5)
    mod = import_handler("list_tickets")
    result = mod.handler({"queryBy": "target", "queryValue": "TGT-000"}, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["count"] == 1


def test_list_tickets_invalid_query_by(aws_env, lambda_context):
    """Invalid queryBy returns 400."""
    mod = import_handler("list_tickets")
    result = mod.handler({"queryBy": "invalid", "queryValue": "x"}, lambda_context)
    assert result["statusCode"] == 400


def test_list_tickets_with_limit(aws_env, lambda_context):
    """Limit parameter restricts result count."""
    _seed_tickets(aws_env, 5)
    mod = import_handler("list_tickets")
    result = mod.handler({"limit": 2}, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["count"] <= 2


def test_list_tickets_sorted_desc(aws_env, lambda_context):
    """Results are sorted by updatedAt descending."""
    _seed_tickets(aws_env, 5)
    mod = import_handler("list_tickets")
    result = mod.handler({}, lambda_context)
    body = json.loads(result["body"])
    timestamps = [t["updatedAt"] for t in body["tickets"]]
    assert timestamps == sorted(timestamps, reverse=True)
