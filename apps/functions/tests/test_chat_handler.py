"""Tests for chat_handler Lambda function."""

import json
import os
import sys
from unittest.mock import MagicMock, patch

import boto3
import pytest
from moto import mock_aws

# Add handler dir to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "chat_handler"))


def _create_tables(ddb):
    """Create required DynamoDB tables for tests."""
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


class TestChatHandler:
    """Tests for chat_handler."""

    def test_missing_message(self, lambda_context):
        from chat_handler.handler import handler
        result = handler({"userId": "user-1", "persona": "osint"}, lambda_context)
        assert result["statusCode"] == 400
        assert "message is required" in json.loads(result["body"])["error"]

    def test_missing_user_id(self, lambda_context):
        from chat_handler.handler import handler
        result = handler({"message": "hello"}, lambda_context)
        assert result["statusCode"] == 400
        assert "userId is required" in json.loads(result["body"])["error"]

    def test_invalid_persona(self, lambda_context):
        from chat_handler.handler import handler
        result = handler({"userId": "u1", "message": "hi", "persona": "invalid"}, lambda_context)
        assert result["statusCode"] == 400
        assert "Invalid persona" in json.loads(result["body"])["error"]

    @mock_aws
    @patch("chat_handler.handler.lambda_client")
    def test_successful_chat(self, mock_lambda, lambda_context):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        _create_tables(ddb)

        # Mock the agent Lambda response
        mock_payload = MagicMock()
        mock_payload.read.return_value = json.dumps({
            "statusCode": 200,
            "body": json.dumps({"content": "Here are the results", "outputData": None}),
        }).encode()
        mock_lambda.invoke.return_value = {"Payload": mock_payload}

        # Override the dynamodb resource in the handler module
        import chat_handler.handler as h
        h.dynamodb = ddb

        result = h.handler({"userId": "user-1", "message": "find vulnerabilities", "persona": "osint"}, lambda_context)
        body = json.loads(result["body"])

        assert result["statusCode"] == 200
        assert body["sessionId"]
        assert body["content"] == "Here are the results"

        # Verify messages were stored
        messages = ddb.Table("RA-ChatMessages").scan()["Items"]
        assert len(messages) == 2  # user + assistant
        roles = {m["role"] for m in messages}
        assert roles == {"user", "assistant"}

    @mock_aws
    @patch("chat_handler.handler.lambda_client")
    def test_session_created(self, mock_lambda, lambda_context):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        _create_tables(ddb)

        mock_payload = MagicMock()
        mock_payload.read.return_value = json.dumps({
            "statusCode": 200,
            "body": json.dumps({"content": "OK", "outputData": None}),
        }).encode()
        mock_lambda.invoke.return_value = {"Payload": mock_payload}

        import chat_handler.handler as h
        h.dynamodb = ddb

        result = h.handler({"userId": "user-1", "message": "hello", "persona": "osint"}, lambda_context)
        body = json.loads(result["body"])

        # Verify session was created
        session = ddb.Table("RA-ChatSessions").get_item(
            Key={"userId": "user-1", "sessionId": body["sessionId"]}
        )["Item"]
        assert session["persona"] == "osint"
        assert session["title"] == "hello"

    @mock_aws
    @patch("chat_handler.handler.lambda_client")
    def test_agent_error_handled(self, mock_lambda, lambda_context):
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        _create_tables(ddb)

        mock_lambda.invoke.side_effect = Exception("Agent crashed")

        import chat_handler.handler as h
        h.dynamodb = ddb

        result = h.handler({"userId": "user-1", "message": "hello", "persona": "osint"}, lambda_context)
        body = json.loads(result["body"])

        assert result["statusCode"] == 200
        assert "error" in body["content"].lower()
