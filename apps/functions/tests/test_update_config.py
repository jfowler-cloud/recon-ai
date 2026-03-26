"""Tests for update_config Lambda handler."""

import json

import boto3
import pytest

from _helpers import import_handler

_mod = import_handler("update_config")
handler = _mod.handler


def test_update_config(aws_env, lambda_context):
    """Test writing a config key-value pair."""
    event = {"body": json.dumps({"configKey": "test-key", "configValue": "test-val"})}
    result = handler(event, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 200
    assert "updated" in body["message"]

    # Verify in DynamoDB
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Config")
    item = table.get_item(Key={"configKey": "test-key"}).get("Item")
    assert item["configValue"] == "test-val"
    assert "updatedAt" in item


def test_missing_config_key(aws_env, lambda_context):
    """Test error when configKey is missing."""
    event = {"body": json.dumps({"configValue": "val"})}
    result = handler(event, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 400
    assert "configKey is required" in body["error"]


def test_overwrite_existing_key(aws_env, lambda_context):
    """Test overwriting an existing config key."""
    handler({"configKey": "k", "configValue": "v1"}, lambda_context)
    handler({"configKey": "k", "configValue": "v2"}, lambda_context)

    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Config")
    item = table.get_item(Key={"configKey": "k"}).get("Item")
    assert item["configValue"] == "v2"


def test_dict_event_body(aws_env, lambda_context):
    """Test handler accepts dict body (direct invocation)."""
    result = handler({"configKey": "dk", "configValue": "dv"}, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 200


def test_null_config_value(aws_env, lambda_context):
    """Test storing None as config value."""
    result = handler({"configKey": "null-key", "configValue": None}, lambda_context)
    assert json.loads(result["body"])["message"]
