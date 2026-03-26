"""Tests for get_session Lambda function."""

import json
import os
import sys

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "get_session"))


def _create_tables(ddb):
    """Create required DynamoDB tables."""
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
    ddb.create_table(
        TableName="RA-ChatMessages",
        KeySchema=[
            {"AttributeName": "sessionId", "KeyType": "HASH"},
            {"AttributeName": "messageId", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "sessionId", "AttributeType": "S"},
            {"AttributeName": "messageId", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


class TestGetSession:
    """Tests for get_session handler."""

    def test_missing_session_id(self, lambda_context):
        from get_session.handler import handler
        result = handler({"userId": "user-1"}, lambda_context)
        assert result["statusCode"] == 400

    def test_missing_user_id(self, lambda_context):
        from get_session.handler import handler
        result = handler({"sessionId": "s1"}, lambda_context)
        assert result["statusCode"] == 400

    @mock_aws
    def test_session_not_found(self, lambda_context):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        _create_tables(ddb)

        import get_session.handler as h
        h.dynamodb = ddb

        result = h.handler({"userId": "user-1", "sessionId": "nonexistent"}, lambda_context)
        assert result["statusCode"] == 404

    @mock_aws
    def test_get_session_with_messages(self, lambda_context):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        _create_tables(ddb)

        # Seed session + messages
        ddb.Table("RA-ChatSessions").put_item(Item={
            "userId": "user-1", "sessionId": "s1", "title": "Test session",
            "createdAt": 1000, "updatedAt": 1000,
        })
        ddb.Table("RA-ChatMessages").put_item(Item={
            "sessionId": "s1", "messageId": "m1", "role": "user",
            "content": "Hello", "createdAt": 1000,
        })
        ddb.Table("RA-ChatMessages").put_item(Item={
            "sessionId": "s1", "messageId": "m2", "role": "assistant",
            "content": "Hi there", "createdAt": 1001,
        })

        import get_session.handler as h
        h.dynamodb = ddb

        result = h.handler({"userId": "user-1", "sessionId": "s1"}, lambda_context)
        body = json.loads(result["body"])

        assert result["statusCode"] == 200
        assert body["session"]["title"] == "Test session"
        assert len(body["messages"]) == 2
        assert body["messages"][0]["role"] == "user"
        assert body["messages"][1]["role"] == "assistant"

    @mock_aws
    def test_wrong_user_cannot_access(self, lambda_context):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        _create_tables(ddb)

        ddb.Table("RA-ChatSessions").put_item(Item={
            "userId": "user-1", "sessionId": "s1", "title": "Private",
        })

        import get_session.handler as h
        h.dynamodb = ddb

        result = h.handler({"userId": "user-2", "sessionId": "s1"}, lambda_context)
        assert result["statusCode"] == 404
