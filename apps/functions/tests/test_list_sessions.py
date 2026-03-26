"""Tests for list_sessions Lambda function."""

import json
import os
import sys

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "list_sessions"))


def _create_sessions_table(ddb):
    """Create RA-ChatSessions table."""
    ddb.create_table(
        TableName="RA-ChatSessions",
        KeySchema=[
            {"AttributeName": "userId", "KeyType": "HASH"},
            {"AttributeName": "sessionId", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "userId", "AttributeType": "S"},
            {"AttributeName": "sessionId", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


class TestListSessions:
    """Tests for list_sessions handler."""

    def test_missing_user_id(self, lambda_context):
        from list_sessions.handler import handler
        result = handler({}, lambda_context)
        assert result["statusCode"] == 400
        assert "userId is required" in json.loads(result["body"])["error"]

    @mock_aws
    def test_empty_sessions(self, lambda_context):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        _create_sessions_table(ddb)

        import list_sessions.handler as h
        h.dynamodb = ddb

        result = h.handler({"userId": "user-1"}, lambda_context)
        body = json.loads(result["body"])

        assert result["statusCode"] == 200
        assert body["sessions"] == []

    @mock_aws
    def test_returns_user_sessions(self, lambda_context):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        _create_sessions_table(ddb)

        table = ddb.Table("RA-ChatSessions")
        table.put_item(Item={"userId": "user-1", "sessionId": "s1", "title": "Session 1", "updatedAt": 1000})
        table.put_item(Item={"userId": "user-1", "sessionId": "s2", "title": "Session 2", "updatedAt": 2000})
        table.put_item(Item={"userId": "user-2", "sessionId": "s3", "title": "Other user", "updatedAt": 3000})

        import list_sessions.handler as h
        h.dynamodb = ddb

        result = h.handler({"userId": "user-1"}, lambda_context)
        body = json.loads(result["body"])

        assert result["statusCode"] == 200
        assert len(body["sessions"]) == 2
        # Should not include other user's session
        session_ids = {s["sessionId"] for s in body["sessions"]}
        assert "s3" not in session_ids

    @mock_aws
    def test_body_string_parsing(self, lambda_context):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        _create_sessions_table(ddb)

        import list_sessions.handler as h
        h.dynamodb = ddb

        result = h.handler({"body": json.dumps({"userId": "user-1"})}, lambda_context)
        body = json.loads(result["body"])
        assert result["statusCode"] == 200
        assert body["sessions"] == []
