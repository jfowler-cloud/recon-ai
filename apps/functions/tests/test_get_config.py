"""Tests for get_config Lambda handler."""

import json

import boto3
import pytest

from _helpers import import_handler

_mod = import_handler("get_config")
handler = _mod.handler


def test_get_all_config(aws_env, lambda_context):
    """Test fetching all config and sources."""
    config_table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Config")
    config_table.put_item(Item={"configKey": "test-key", "configValue": "test-val"})

    sources_table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-DataSources")
    sources_table.put_item(Item={"sourceId": "shodan", "name": "Shodan"})

    result = handler({}, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 200
    assert len(body["config"]) == 1
    assert body["config"][0]["configKey"] == "test-key"
    assert len(body["sources"]) == 1
    assert body["sources"][0]["sourceId"] == "shodan"


def test_get_specific_config_key(aws_env, lambda_context):
    """Test fetching a specific config key."""
    config_table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Config")
    config_table.put_item(Item={"configKey": "my-key", "configValue": "my-val"})

    result = handler({"configKey": "my-key"}, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 200
    assert body["config"]["configKey"] == "my-key"
    assert body["config"]["configValue"] == "my-val"


def test_get_missing_config_key(aws_env, lambda_context):
    """Test fetching a non-existent config key returns None."""
    result = handler({"configKey": "nonexistent"}, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 200
    assert body["config"] is None


def test_string_body_format(aws_env, lambda_context):
    """Test handler parses JSON string body."""
    config_table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Config")
    config_table.put_item(Item={"configKey": "k1", "configValue": "v1"})

    result = handler({"body": json.dumps({"configKey": "k1"})}, lambda_context)
    body = json.loads(result["body"])

    assert body["config"]["configKey"] == "k1"


def test_empty_tables(aws_env, lambda_context):
    """Test with empty config and sources tables."""
    result = handler({}, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 200
    assert body["config"] == []
    assert body["sources"] == []
