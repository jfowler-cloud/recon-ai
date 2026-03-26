"""Tests for OSINT chat agent tools."""

import time
from unittest.mock import patch

import boto3
import pytest
from moto import mock_aws


class TestGetVulnerabilitySummary:
    """Tests for get_vulnerability_summary tool."""

    @mock_aws
    def test_empty_documents(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="RA-Documents",
            KeySchema=[
                {"AttributeName": "uploadId", "KeyType": "HASH"},
                {"AttributeName": "documentId", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "uploadId", "AttributeType": "S"},
                {"AttributeName": "documentId", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        import shared.db as db_mod
        db_mod._dynamodb = None

        from osint_chat_agent.tools import get_vulnerability_summary
        result = get_vulnerability_summary()
        assert result["total"] == 0
        assert result["vulnerabilityDocuments"] == []

    @mock_aws
    def test_with_vuln_documents(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="RA-Documents",
            KeySchema=[
                {"AttributeName": "uploadId", "KeyType": "HASH"},
                {"AttributeName": "documentId", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "uploadId", "AttributeType": "S"},
                {"AttributeName": "documentId", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        table = ddb.Table("RA-Documents")
        table.put_item(Item={
            "uploadId": "u1", "documentId": "d1",
            "text": "CVE-2024-1234 vulnerability found on port 443",
            "sourceType": "shodan_json", "importance": "high",
        })
        table.put_item(Item={
            "uploadId": "u1", "documentId": "d2",
            "text": "Normal network traffic observed",
            "sourceType": "nmap_xml", "importance": "standard",
        })

        import shared.db as db_mod
        db_mod._dynamodb = None

        from osint_chat_agent.tools import get_vulnerability_summary
        result = get_vulnerability_summary()
        assert result["total"] == 2
        assert result["byImportance"]["high"] == 1
        assert result["bySourceType"]["shodan_json"] == 1
        # Only doc with vulnerability keywords should appear
        assert len(result["vulnerabilityDocuments"]) == 1
        assert result["vulnerabilityDocuments"][0]["documentId"] == "d1"


class TestGetTicketSummary:
    """Tests for get_ticket_summary tool."""

    @mock_aws
    def test_empty_tickets(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="RA-Tickets",
            KeySchema=[{"AttributeName": "ticketId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "ticketId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        import shared.db as db_mod
        db_mod._dynamodb = None

        from osint_chat_agent.tools import get_ticket_summary
        result = get_ticket_summary()
        assert result["total"] == 0

    @mock_aws
    def test_with_tickets(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="RA-Tickets",
            KeySchema=[{"AttributeName": "ticketId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "ticketId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        table = ddb.Table("RA-Tickets")
        table.put_item(Item={"ticketId": "t1", "ticketType": "osint", "status": "new", "severity": "high", "title": "Port scan"})
        table.put_item(Item={"ticketId": "t2", "ticketType": "osint", "status": "active", "severity": "medium", "title": "DNS enum"})
        table.put_item(Item={"ticketId": "t3", "ticketType": "redteam", "status": "new", "severity": "low", "title": "Tool test"})

        import shared.db as db_mod
        db_mod._dynamodb = None

        from osint_chat_agent.tools import get_ticket_summary
        result = get_ticket_summary(ticket_type="osint")
        assert result["total"] == 2
        assert result["byStatus"]["new"] == 1
        assert result["byStatus"]["active"] == 1

    @mock_aws
    def test_filter_by_status(self):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="RA-Tickets",
            KeySchema=[{"AttributeName": "ticketId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "ticketId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        table = ddb.Table("RA-Tickets")
        table.put_item(Item={"ticketId": "t1", "ticketType": "osint", "status": "new", "severity": "high"})
        table.put_item(Item={"ticketId": "t2", "ticketType": "osint", "status": "active", "severity": "medium"})

        import shared.db as db_mod
        db_mod._dynamodb = None

        from osint_chat_agent.tools import get_ticket_summary
        result = get_ticket_summary(status="active")
        assert result["total"] == 1
