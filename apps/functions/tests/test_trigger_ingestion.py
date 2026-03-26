"""Tests for trigger_ingestion Lambda handler."""

import json
from unittest.mock import patch, MagicMock

import boto3
import pytest

from _helpers import import_handler

_mod = import_handler("trigger_ingestion")
handler = _mod.handler


def test_prepare_sources_list(aws_env, lambda_context):
    """Test Step Functions mode returns source list."""
    sources_table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-DataSources")
    sources_table.put_item(Item={"sourceId": "shodan", "name": "Shodan", "parser": "shodan_json"})
    sources_table.put_item(Item={"sourceId": "nmap", "name": "Nmap", "parser": "nmap_xml"})

    result = handler({}, lambda_context)

    assert "sources" in result
    assert len(result["sources"]) == 2
    source_ids = {s["sourceId"] for s in result["sources"]}
    assert source_ids == {"shodan", "nmap"}


def test_manual_trigger_starts_workflow(aws_env, lambda_context, monkeypatch):
    """Test manual trigger starts Step Functions workflow."""
    monkeypatch.setenv("INGESTION_WORKFLOW_ARN", "arn:aws:states:us-east-1:123:stateMachine:RA-IngestionWorkflow")

    with patch.object(_mod.boto3, "client") as mock_client:
        mock_sfn = MagicMock()
        mock_client.return_value = mock_sfn

        result = handler({"manual": True}, lambda_context)
        body = json.loads(result["body"])

        assert result["statusCode"] == 200
        assert "started" in body["message"]
        mock_sfn.start_execution.assert_called_once()


def test_manual_trigger_missing_arn(aws_env, lambda_context, monkeypatch):
    """Test manual trigger fails when workflow ARN is missing."""
    monkeypatch.setenv("INGESTION_WORKFLOW_ARN", "")

    result = handler({"manual": True}, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 500
    assert "not configured" in body["error"]


def test_manual_trigger_via_string_body(aws_env, lambda_context, monkeypatch):
    """Test manual trigger via JSON string body."""
    monkeypatch.setenv("INGESTION_WORKFLOW_ARN", "arn:aws:states:us-east-1:123:stateMachine:RA-IngestionWorkflow")

    with patch.object(_mod.boto3, "client") as mock_client:
        mock_sfn = MagicMock()
        mock_client.return_value = mock_sfn

        result = handler({"body": json.dumps({"manual": True})}, lambda_context)
        assert result["statusCode"] == 200


def test_invalid_json_body(aws_env, lambda_context):
    """Test invalid JSON body returns 400."""
    result = handler({"body": "not-json{"}, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 400
    assert "Invalid JSON" in body["error"]


def test_empty_sources_table(aws_env, lambda_context):
    """Test returns empty list when no sources exist."""
    result = handler({}, lambda_context)
    assert result["sources"] == []


def test_source_includes_parser(aws_env, lambda_context):
    """Test source entries include parser field."""
    sources_table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-DataSources")
    sources_table.put_item(Item={"sourceId": "docs", "name": "Documents", "parser": "document_textract"})

    result = handler({}, lambda_context)
    assert result["sources"][0]["parser"] == "document_textract"
