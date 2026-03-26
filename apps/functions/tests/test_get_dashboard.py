"""Tests for get_dashboard handler."""

import json
import time

from _helpers import import_handler


def _seed_data(ddb):
    """Insert test uploads, tickets, and targets."""
    now = int(time.time())

    # Uploads
    uploads_table = ddb.Table("RA-Uploads")
    for i in range(5):
        uploads_table.put_item(Item={
            "uploadId": f"UPL-{i:03d}",
            "analystId": "analyst-1",
            "sourceType": "shodan_json" if i < 3 else "nmap_xml",
            "ingestionStatus": "completed" if i < 4 else "pending",
            "createdAt": now + i,
            "updatedAt": now + i,
        })

    # Tickets
    tickets_table = ddb.Table("RA-Tickets")
    types = ["osint-investigation", "red-team-operation", "escalation"]
    severities = ["critical", "high", "medium", "low"]
    statuses = ["new", "triaging", "investigating", "active"]
    for i in range(8):
        tickets_table.put_item(Item={
            "ticketId": f"TKT-{i:03d}",
            "title": f"Ticket {i}",
            "ticketType": types[i % 3],
            "severity": severities[i % 4],
            "status": statuses[i % 4],
            "assigneeId": "analyst-1",
            "createdAt": now + i,
            "updatedAt": now + i,
        })

    # Targets
    targets_table = ddb.Table("RA-Targets")
    for i in range(3):
        targets_table.put_item(Item={
            "targetId": f"TGT-{i:03d}",
            "name": f"Target {i}",
            "status": "queued" if i < 2 else "active",
            "priorityScore": i * 10,
            "createdAt": now + i,
            "updatedAt": now + i,
        })


def test_dashboard_osint_analyst(aws_env, lambda_context):
    """OSINT analyst dashboard returns relevant data."""
    _seed_data(aws_env)
    mod = import_handler("get_dashboard")
    result = mod.handler({"persona": "osint-analyst"}, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])

    assert body["persona"] == "osint-analyst"
    assert body["uploads"]["total"] == 5
    assert body["uploads"]["byStatus"]["completed"] == 4
    assert body["uploads"]["byStatus"]["pending"] == 1
    # OSINT sees osint-investigation + escalation
    assert body["tickets"]["total"] > 0
    assert "targets" not in body  # only leadership gets targets


def test_dashboard_red_team_analyst(aws_env, lambda_context):
    """Red team analyst sees red-team-operation + escalation tickets."""
    _seed_data(aws_env)
    mod = import_handler("get_dashboard")
    result = mod.handler({"persona": "red-team-analyst"}, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["persona"] == "red-team-analyst"
    # Check tickets only include red-team-operation and escalation
    for ticket in body["recentTickets"]:
        assert ticket["ticketType"] in {"red-team-operation", "escalation"}


def test_dashboard_leadership(aws_env, lambda_context):
    """Leadership dashboard includes cross-domain data and targets."""
    _seed_data(aws_env)
    mod = import_handler("get_dashboard")
    result = mod.handler({"persona": "leadership"}, lambda_context)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])

    assert body["persona"] == "leadership"
    assert body["tickets"]["total"] == 8  # leadership sees all types
    assert "targets" in body
    assert body["targets"]["total"] == 3
    assert body["targets"]["byStatus"]["queued"] == 2
    assert body["targets"]["byStatus"]["active"] == 1


def test_dashboard_invalid_persona(aws_env, lambda_context):
    """Invalid persona returns 400."""
    mod = import_handler("get_dashboard")
    result = mod.handler({"persona": "hacker"}, lambda_context)
    assert result["statusCode"] == 400


def test_dashboard_recent_uploads_limited(aws_env, lambda_context):
    """Recent uploads are limited to 10."""
    _seed_data(aws_env)
    mod = import_handler("get_dashboard")
    result = mod.handler({"persona": "osint-analyst"}, lambda_context)
    body = json.loads(result["body"])
    assert len(body["recentUploads"]) <= 10


def test_dashboard_recent_tickets_limited(aws_env, lambda_context):
    """Recent tickets are limited to 10."""
    _seed_data(aws_env)
    mod = import_handler("get_dashboard")
    result = mod.handler({"persona": "leadership"}, lambda_context)
    body = json.loads(result["body"])
    assert len(body["recentTickets"]) <= 10
