"""Tests for seed_data Lambda handler (CDK custom resource)."""

import json
from unittest.mock import patch, MagicMock

import boto3
import pytest

from _helpers import import_handler

_mod = import_handler("seed_data")
handler = _mod.handler
DATA_SOURCES = _mod.DATA_SOURCES


def test_seed_creates_all_sources(aws_env, lambda_context):
    """Test that Create event seeds all data sources."""
    event = {"RequestType": "Create", "LogicalResourceId": "SeedData"}
    result = handler(event, lambda_context)

    assert result["status"] == "SUCCESS"

    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-DataSources")
    items = table.scan()["Items"]
    assert len(items) == len(DATA_SOURCES)

    source_ids = {i["sourceId"] for i in items}
    assert "shodan" in source_ids
    assert "nmap" in source_ids
    assert "social" in source_ids
    assert "logs" in source_ids
    assert "documents" in source_ids
    assert "custom" in source_ids


def test_seed_idempotent(aws_env, lambda_context):
    """Test that running seed twice doesn't duplicate sources."""
    event = {"RequestType": "Create", "LogicalResourceId": "SeedData"}
    handler(event, lambda_context)
    result = handler(event, lambda_context)

    assert result["status"] == "SUCCESS"

    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-DataSources")
    items = table.scan()["Items"]
    assert len(items) == len(DATA_SOURCES)


def test_delete_event_noop(aws_env, lambda_context):
    """Test that Delete event does nothing."""
    event = {"RequestType": "Delete", "LogicalResourceId": "SeedData"}
    result = handler(event, lambda_context)

    assert result["status"] == "SUCCESS"
    assert "Delete" in result["reason"]


def test_update_event_seeds(aws_env, lambda_context):
    """Test that Update event also seeds (same as Create)."""
    event = {"RequestType": "Update", "LogicalResourceId": "SeedData"}
    result = handler(event, lambda_context)

    assert result["status"] == "SUCCESS"
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-DataSources")
    items = table.scan()["Items"]
    assert len(items) == len(DATA_SOURCES)


def test_cfn_response_with_url(aws_env, lambda_context):
    """Test CloudFormation response is sent when ResponseURL is present."""
    event = {
        "RequestType": "Delete",
        "LogicalResourceId": "SeedData",
        "ResponseURL": "https://cfn-response.example.com/callback",
        "StackId": "stack-123",
        "RequestId": "req-456",
    }

    with patch.object(_mod.urllib.request, "urlopen") as mock_urlopen:
        mock_urlopen.return_value = MagicMock()
        result = handler(event, lambda_context)

        assert result["status"] == "SUCCESS"
        mock_urlopen.assert_called_once()
        call_args = mock_urlopen.call_args[0][0]
        assert call_args.full_url == "https://cfn-response.example.com/callback"


def test_cfn_response_urlopen_failure_handled(aws_env, lambda_context):
    """Test that urlopen failure in _send_response is caught and does not crash."""
    event = {
        "RequestType": "Delete",
        "LogicalResourceId": "SeedData",
        "ResponseURL": "https://cfn-response.example.com/callback",
        "StackId": "stack-123",
        "RequestId": "req-456",
    }

    with patch.object(_mod.urllib.request, "urlopen", side_effect=Exception("Connection refused")):
        result = handler(event, lambda_context)

    # Handler should still succeed despite urlopen failure
    assert result["status"] == "SUCCESS"
    assert "Delete" in result["reason"]


def test_source_has_expected_fields(aws_env, lambda_context):
    """Test seeded sources have all expected fields."""
    event = {"RequestType": "Create", "LogicalResourceId": "SeedData"}
    handler(event, lambda_context)

    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-DataSources")
    item = table.get_item(Key={"sourceId": "shodan"}).get("Item")
    assert item["name"] == "Shodan Results"
    assert item["parser"] == "shodan_json"
    assert "description" in item
