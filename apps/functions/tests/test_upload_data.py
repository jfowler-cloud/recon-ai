"""Tests for upload_data Lambda handler."""

import json

import boto3
import pytest

from _helpers import import_handler

_mod = import_handler("upload_data")
handler = _mod.handler


def test_successful_upload(aws_env, lambda_context):
    """Test generating presigned URL and creating upload record."""
    event = {
        "body": json.dumps({
            "fileName": "scan_results.json",
            "sourceType": "shodan_json",
            "analystId": "analyst-001",
        })
    }

    result = handler(event, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 200
    assert "uploadId" in body
    assert "presignedUrl" in body
    assert "s3Key" in body
    assert "shodan_json" in body["s3Key"]
    assert "scan_results.json" in body["s3Key"]

    # Verify DynamoDB record was created
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Uploads")
    item = table.get_item(Key={"uploadId": body["uploadId"]}).get("Item")
    assert item is not None
    assert item["sourceType"] == "shodan_json"
    assert item["analystId"] == "analyst-001"
    assert item["ingestionStatus"] == "pending"


def test_missing_filename(aws_env, lambda_context):
    """Test error when fileName is missing."""
    event = {"body": json.dumps({"sourceType": "shodan_json"})}
    result = handler(event, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 400
    assert "fileName is required" in body["error"]


def test_default_source_type(aws_env, lambda_context):
    """Test default sourceType is 'custom'."""
    event = {"body": json.dumps({"fileName": "data.txt"})}
    result = handler(event, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 200
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Uploads")
    item = table.get_item(Key={"uploadId": body["uploadId"]}).get("Item")
    assert item["sourceType"] == "custom"


def test_default_analyst_id(aws_env, lambda_context):
    """Test default analystId is 'unknown'."""
    event = {"body": json.dumps({"fileName": "data.txt"})}
    result = handler(event, lambda_context)
    body = json.loads(result["body"])

    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Uploads")
    item = table.get_item(Key={"uploadId": body["uploadId"]}).get("Item")
    assert item["analystId"] == "unknown"


def test_valid_source_type_accepted(aws_env, lambda_context):
    """Test that all valid sourceTypes are accepted."""
    for st in ["shodan_json", "nmap_xml", "social_csv", "log_text", "document_textract",
                "text_passthrough", "custom", "shodan", "nmap", "social", "logs", "documents"]:
        event = {"body": json.dumps({"fileName": "test.txt", "sourceType": st})}
        result = handler(event, lambda_context)
        assert result["statusCode"] == 200, f"sourceType '{st}' should be accepted"


def test_short_source_name_normalized(aws_env, lambda_context):
    """Test that short source names like 'shodan' are normalized to 'shodan_json' in the stored record."""
    name_map = {
        "shodan": "shodan_json",
        "nmap": "nmap_xml",
        "social": "social_csv",
        "logs": "log_text",
        "documents": "document_textract",
    }
    for short_name, normalized in name_map.items():
        event = {"body": json.dumps({"fileName": "test.txt", "sourceType": short_name})}
        result = handler(event, lambda_context)
        body = json.loads(result["body"])
        assert result["statusCode"] == 200, f"sourceType '{short_name}' should be accepted"

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Uploads")
        item = table.get_item(Key={"uploadId": body["uploadId"]}).get("Item")
        assert item["sourceType"] == normalized, f"'{short_name}' should be normalized to '{normalized}'"
        assert normalized in body["s3Key"], f"s3Key should contain normalized name '{normalized}'"


def test_invalid_source_type_rejected(aws_env, lambda_context):
    """Test that invalid sourceType returns 400."""
    event = {"body": json.dumps({"fileName": "test.txt", "sourceType": "hacker_news"})}
    result = handler(event, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 400
    assert "Invalid sourceType" in body["error"]


def test_dict_event_body(aws_env, lambda_context):
    """Test handler accepts dict body (direct invocation)."""
    event = {"fileName": "data.txt", "sourceType": "log_text", "analystId": "a1"}
    result = handler(event, lambda_context)
    body = json.loads(result["body"])

    assert result["statusCode"] == 200
    assert "uploadId" in body
