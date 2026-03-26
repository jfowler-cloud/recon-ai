"""Tests for Leadership chat agent tools."""

import time

import boto3
import pytest
from moto import mock_aws


def _create_tickets_table(ddb):
    """Helper to create mocked RA-Tickets table."""
    ddb.create_table(
        TableName="RA-Tickets",
        KeySchema=[{"AttributeName": "ticketId", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "ticketId", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )
    return ddb.Table("RA-Tickets")


def _create_targets_table(ddb):
    ddb.create_table(
        TableName="RA-Targets",
        KeySchema=[{"AttributeName": "targetId", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "targetId", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )
    return ddb.Table("RA-Targets")


def _create_tool_actions_table(ddb):
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
    return ddb.Table("RA-ToolActions")


class TestGetOperationsOverview:
    """Tests for get_operations_overview tool."""

    @mock_aws
    def test_empty(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        _create_tickets_table(ddb)

        import shared.db as db_mod
        db_mod._dynamodb = None

        from leadership_chat_agent.tools import get_operations_overview
        result = get_operations_overview()
        assert result["total"] == 0
        assert result["open"] == 0
        assert result["closed"] == 0

    @mock_aws
    def test_with_tickets(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        table = _create_tickets_table(ddb)
        table.put_item(Item={"ticketId": "t1", "status": "new", "ticketType": "osint", "severity": "high"})
        table.put_item(Item={"ticketId": "t2", "status": "active", "ticketType": "redteam", "severity": "medium"})
        table.put_item(Item={"ticketId": "t3", "status": "completed", "ticketType": "osint", "severity": "low"})

        import shared.db as db_mod
        db_mod._dynamodb = None

        from leadership_chat_agent.tools import get_operations_overview
        result = get_operations_overview()
        assert result["total"] == 3
        assert result["open"] == 2
        assert result["closed"] == 1
        assert result["byType"]["osint"] == 2
        assert result["byType"]["redteam"] == 1


class TestGetAnalystWorkload:
    """Tests for get_analyst_workload tool."""

    @mock_aws
    def test_workload_distribution(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        table = _create_tickets_table(ddb)
        table.put_item(Item={"ticketId": "t1", "assignee": "alice", "status": "active", "ticketType": "osint"})
        table.put_item(Item={"ticketId": "t2", "assignee": "alice", "status": "new", "ticketType": "osint"})
        table.put_item(Item={"ticketId": "t3", "assignee": "bob", "status": "completed", "ticketType": "redteam"})

        import shared.db as db_mod
        db_mod._dynamodb = None

        from leadership_chat_agent.tools import get_analyst_workload
        result = get_analyst_workload()
        assert result["totalAnalysts"] == 2
        # Alice has 2 open, should be first
        alice = [w for w in result["workload"] if w["assignee"] == "alice"][0]
        assert alice["open"] == 2
        assert alice["total"] == 2
        bob = [w for w in result["workload"] if w["assignee"] == "bob"][0]
        assert bob["closed"] == 1


class TestGetRecentActivities:
    """Tests for get_recent_activities tool."""

    @mock_aws
    def test_recent_activities(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        table = _create_tickets_table(ddb)
        targets_table = _create_targets_table(ddb)
        actions_table = _create_tool_actions_table(ddb)

        now = int(time.time())
        table.put_item(Item={"ticketId": "t1", "title": "Recent ticket", "status": "new", "createdAt": now})
        table.put_item(Item={"ticketId": "t2", "title": "Old ticket", "status": "closed", "createdAt": now - 86400 * 30})
        targets_table.put_item(Item={"targetId": "tgt1", "name": "New target", "status": "active", "createdAt": now, "priorityScore": 80})

        import shared.db as db_mod
        db_mod._dynamodb = None

        from leadership_chat_agent.tools import get_recent_activities
        result = get_recent_activities(days=7)
        # Should include recent ticket and target, but not old ticket
        types = [a["type"] for a in result["activities"]]
        assert "ticket" in types
        assert "target" in types
        # Old ticket should not appear
        old = [a for a in result["activities"] if a.get("title") == "Old ticket"]
        assert len(old) == 0
