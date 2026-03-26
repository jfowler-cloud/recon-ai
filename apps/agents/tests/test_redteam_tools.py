"""Tests for Red Team chat agent tools."""

import boto3
import pytest
from moto import mock_aws


class TestGetPriorityTargets:
    """Tests for get_priority_targets tool."""

    @mock_aws
    def test_empty_targets(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="RA-Targets",
            KeySchema=[{"AttributeName": "targetId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "targetId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        import shared.db as db_mod
        db_mod._dynamodb = None

        from redteam_chat_agent.tools import get_priority_targets
        result = get_priority_targets()
        assert result["targets"] == []
        assert result["total"] == 0

    @mock_aws
    def test_sorted_by_score(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="RA-Targets",
            KeySchema=[{"AttributeName": "targetId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "targetId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        table = ddb.Table("RA-Targets")
        table.put_item(Item={"targetId": "t1", "name": "Low", "status": "active", "priorityScore": 30})
        table.put_item(Item={"targetId": "t2", "name": "High", "status": "active", "priorityScore": 90})
        table.put_item(Item={"targetId": "t3", "name": "Medium", "status": "active", "priorityScore": 60})

        import shared.db as db_mod
        db_mod._dynamodb = None

        from redteam_chat_agent.tools import get_priority_targets
        result = get_priority_targets()
        assert result["total"] == 3
        assert result["targets"][0]["name"] == "High"
        assert result["targets"][1]["name"] == "Medium"
        assert result["targets"][2]["name"] == "Low"

    @mock_aws
    def test_filter_by_status(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="RA-Targets",
            KeySchema=[{"AttributeName": "targetId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "targetId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        table = ddb.Table("RA-Targets")
        table.put_item(Item={"targetId": "t1", "status": "active", "priorityScore": 80})
        table.put_item(Item={"targetId": "t2", "status": "completed", "priorityScore": 90})

        import shared.db as db_mod
        db_mod._dynamodb = None

        from redteam_chat_agent.tools import get_priority_targets
        result = get_priority_targets(status="active")
        assert result["total"] == 1
        assert result["targets"][0]["targetId"] == "t1"


class TestGetToolHistory:
    """Tests for get_tool_history tool."""

    @mock_aws
    def test_empty_actions(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
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

        import shared.db as db_mod
        db_mod._dynamodb = None

        from redteam_chat_agent.tools import get_tool_history
        result = get_tool_history()
        assert result["actions"] == []

    @mock_aws
    def test_filter_by_ticket(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
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
        table = ddb.Table("RA-ToolActions")
        table.put_item(Item={"ticketId": "t1", "actionId": "a1", "toolName": "nmap", "createdAt": 1000})
        table.put_item(Item={"ticketId": "t2", "actionId": "a2", "toolName": "masscan", "createdAt": 2000})

        import shared.db as db_mod
        db_mod._dynamodb = None

        from redteam_chat_agent.tools import get_tool_history
        result = get_tool_history(ticket_id="t1")
        assert len(result["actions"]) == 1
        assert result["actions"][0]["toolName"] == "nmap"


class TestGetLeadershipGoals:
    """Tests for get_leadership_goals tool."""

    @mock_aws
    def test_empty_goals(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="RA-LeadershipContext",
            KeySchema=[{"AttributeName": "contextId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "contextId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        import shared.db as db_mod
        db_mod._dynamodb = None

        from redteam_chat_agent.tools import get_leadership_goals
        result = get_leadership_goals()
        assert result["goals"] == []
        assert result["total"] == 0

    @mock_aws
    def test_goals_sorted_by_priority(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="RA-LeadershipContext",
            KeySchema=[{"AttributeName": "contextId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "contextId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        table = ddb.Table("RA-LeadershipContext")
        table.put_item(Item={"contextId": "c1", "title": "Low priority", "priority": "low", "updatedAt": 100})
        table.put_item(Item={"contextId": "c2", "title": "Critical goal", "priority": "critical", "updatedAt": 200})
        table.put_item(Item={"contextId": "c3", "title": "Medium goal", "priority": "medium", "updatedAt": 150})

        import shared.db as db_mod
        db_mod._dynamodb = None

        from redteam_chat_agent.tools import get_leadership_goals
        result = get_leadership_goals()
        assert result["total"] == 3
        assert result["goals"][0]["title"] == "Critical goal"
        assert result["goals"][1]["title"] == "Medium goal"
        assert result["goals"][2]["title"] == "Low priority"
