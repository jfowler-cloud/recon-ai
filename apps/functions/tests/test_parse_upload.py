"""Tests for parse_upload Lambda handler."""

import json
from unittest.mock import patch, MagicMock

import boto3
import pytest

from _helpers import import_handler

_mod = import_handler("parse_upload")
handler = _mod.handler


# ---- detect mode ----

def test_auto_detect_json(aws_env, lambda_context):
    event = {"mode": "detect", "uploadId": "u1", "s3Key": "uploads/auto/u1/scan.json", "sourceType": "auto"}
    result = handler(event, lambda_context)
    assert result["detectedType"] == "shodan_json"

    # Check upload status updated to processing
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Uploads")
    table.put_item(Item={"uploadId": "u2", "ingestionStatus": "pending"})
    event2 = {"mode": "detect", "uploadId": "u2", "s3Key": "uploads/auto/u2/scan.json", "sourceType": "auto"}
    handler(event2, lambda_context)
    item = table.get_item(Key={"uploadId": "u2"}).get("Item")
    assert item["ingestionStatus"] == "processing"


def test_auto_detect_pdf(aws_env, lambda_context):
    event = {"mode": "detect", "uploadId": "u1", "s3Key": "uploads/auto/u1/report.pdf", "sourceType": "auto"}
    result = handler(event, lambda_context)
    assert result["detectedType"] == "document_textract"


def test_auto_detect_png(aws_env, lambda_context):
    event = {"mode": "detect", "uploadId": "u1", "s3Key": "uploads/auto/u1/screenshot.png", "sourceType": "auto"}
    result = handler(event, lambda_context)
    assert result["detectedType"] == "document_textract"


def test_auto_detect_xml(aws_env, lambda_context):
    event = {"mode": "detect", "uploadId": "u1", "s3Key": "uploads/auto/u1/scan.xml", "sourceType": "auto"}
    result = handler(event, lambda_context)
    assert result["detectedType"] == "nmap_xml"


def test_auto_detect_csv(aws_env, lambda_context):
    event = {"mode": "detect", "uploadId": "u1", "s3Key": "uploads/auto/u1/feed.csv", "sourceType": "auto"}
    result = handler(event, lambda_context)
    assert result["detectedType"] == "social_csv"


def test_auto_detect_unknown_ext(aws_env, lambda_context):
    event = {"mode": "detect", "uploadId": "u1", "s3Key": "uploads/auto/u1/data.xyz", "sourceType": "auto"}
    result = handler(event, lambda_context)
    assert result["detectedType"] == "text_passthrough"


def test_explicit_source_type(aws_env, lambda_context):
    event = {"mode": "detect", "uploadId": "u1", "s3Key": "uploads/shodan/u1/data.bin", "sourceType": "shodan_json"}
    result = handler(event, lambda_context)
    assert result["sourceType"] == "shodan_json"


def test_no_extension(aws_env, lambda_context):
    event = {"mode": "detect", "uploadId": "u1", "s3Key": "uploads/auto/u1/noext", "sourceType": "auto"}
    result = handler(event, lambda_context)
    assert result["detectedType"] == "text_passthrough"


# ---- EventBridge-style uploadId parsing ----

def test_eventbridge_upload_id_parsed_from_s3_key(aws_env, lambda_context):
    """When uploadId == s3Key and path has 4+ parts starting with uploads/, parse real uploadId."""
    s3_key = "uploads/shodan_json/real-uid-123/scan.json"
    event = {"mode": "detect", "uploadId": s3_key, "s3Key": s3_key, "sourceType": "auto"}
    result = handler(event, lambda_context)
    assert result["uploadId"] == "real-uid-123"


def test_eventbridge_extracts_source_type_from_path(aws_env, lambda_context):
    """When triggered by EventBridge with sourceType=auto, extract sourceType from path."""
    s3_key = "uploads/nmap_xml/uid-456/scan.xml"
    event = {"mode": "detect", "uploadId": s3_key, "s3Key": s3_key, "sourceType": "auto"}
    result = handler(event, lambda_context)
    assert result["uploadId"] == "uid-456"
    assert result["sourceType"] == "nmap_xml"


def test_eventbridge_preserves_explicit_source_type(aws_env, lambda_context):
    """When EventBridge path detected but sourceType explicitly set, keep explicit value."""
    s3_key = "uploads/shodan_json/uid-789/data.json"
    event = {"mode": "detect", "uploadId": s3_key, "s3Key": s3_key, "sourceType": "log_text"}
    result = handler(event, lambda_context)
    assert result["uploadId"] == "uid-789"
    assert result["sourceType"] == "log_text"


def test_eventbridge_auto_path_does_not_override_source_type(aws_env, lambda_context):
    """When path sourceType is 'auto', don't override — let auto-detect handle it."""
    s3_key = "uploads/auto/uid-abc/report.pdf"
    event = {"mode": "detect", "uploadId": s3_key, "s3Key": s3_key, "sourceType": "auto"}
    result = handler(event, lambda_context)
    assert result["uploadId"] == "uid-abc"
    # sourceType stays auto → falls through to extension-based detection
    assert result["detectedType"] == "document_textract"


def test_non_eventbridge_upload_id_unchanged(aws_env, lambda_context):
    """When uploadId has no slash (normal invocation), uploadId is not parsed from path."""
    event = {"mode": "detect", "uploadId": "u1", "s3Key": "uploads/auto/u1/scan.json", "sourceType": "auto"}
    result = handler(event, lambda_context)
    assert result["uploadId"] == "u1"


def test_short_path_no_parsing(aws_env, lambda_context):
    """Paths with fewer than 4 parts should not trigger EventBridge parsing — warning logged."""
    s3_key = "uploads/scan.json"
    event = {"mode": "detect", "uploadId": s3_key, "s3Key": s3_key, "sourceType": "auto"}
    result = handler(event, lambda_context)
    # uploadId should remain as the full s3Key since path is too short
    assert result["uploadId"] == s3_key


def test_eventbridge_unexpected_structure_warns(aws_env, lambda_context):
    """When uploadId contains '/' but path doesn't start with 'uploads/', log warning and keep uploadId."""
    s3_key = "other/path/file.json"
    event = {"mode": "detect", "uploadId": s3_key, "s3Key": s3_key, "sourceType": "auto"}
    with patch.object(_mod, "logger") as mock_logger:
        result = handler(event, lambda_context)
        mock_logger.warning.assert_called_once()
    assert result["uploadId"] == s3_key


# ---- parse mode ----

def test_parse_text_file(aws_env, lambda_context):
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.put_object(Bucket="recon-ai-uploads-test", Key="uploads/u1/data.txt", Body=b"Hello world")

    event = {"mode": "parse", "uploadId": "u1", "s3Key": "uploads/u1/data.txt", "sourceType": "text_passthrough"}
    result = handler(event, lambda_context)

    assert result["uploadId"] == "u1"
    assert len(result["documents"]) >= 1
    assert "Hello world" in result["documents"][0]["text"]


def test_parse_adapter_non_list_returns_empty(aws_env, lambda_context):
    """When adapter returns a non-list value, _parse should coerce to empty list."""
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.put_object(Bucket="recon-ai-uploads-test", Key="uploads/u1/data.txt", Body=b"Hello")

    with patch.object(_mod, "get_adapter", return_value=lambda content, uid, key: "not-a-list"):
        event = {"mode": "parse", "uploadId": "u1", "s3Key": "uploads/u1/data.txt", "sourceType": "text_passthrough"}
        result = handler(event, lambda_context)

    assert result["documents"] == []


def test_parse_adapter_none_returns_empty(aws_env, lambda_context):
    """When adapter returns None, _parse should coerce to empty list."""
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.put_object(Bucket="recon-ai-uploads-test", Key="uploads/u1/data.txt", Body=b"Hello")

    with patch.object(_mod, "get_adapter", return_value=lambda content, uid, key: None):
        event = {"mode": "parse", "uploadId": "u1", "s3Key": "uploads/u1/data.txt", "sourceType": "text_passthrough"}
        result = handler(event, lambda_context)

    assert result["documents"] == []


def test_parse_shodan_json(aws_env, lambda_context):
    s3 = boto3.client("s3", region_name="us-east-1")
    record = json.dumps({"ip_str": "1.2.3.4", "port": 80}).encode()
    s3.put_object(Bucket="recon-ai-uploads-test", Key="uploads/u1/scan.json", Body=record)

    event = {"mode": "parse", "uploadId": "u1", "s3Key": "uploads/u1/scan.json", "sourceType": "shodan_json"}
    result = handler(event, lambda_context)

    assert len(result["documents"]) == 1
    assert "1.2.3.4" in result["documents"][0]["text"]


# ---- embed mode ----

def test_embed_documents(aws_env, lambda_context):
    fake_embedding = [0.1] * 256
    mock_bedrock = MagicMock()
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps({"embedding": fake_embedding}).encode()
    mock_bedrock.invoke_model.return_value = {"body": mock_body}

    with patch.object(_mod.boto3, "client", return_value=mock_bedrock):
        event = {
            "mode": "embed",
            "uploadId": "u1",
            "documents": [
                {"text": "Test document text", "metadata": {"s3Key": "test.txt"}, "sourceType": "custom", "importance": "standard"},
            ],
        }
        result = handler(event, lambda_context)

    assert result["documentCount"] == 1

    # Verify DynamoDB record
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Documents")
    items = table.scan()["Items"]
    assert len(items) == 1
    assert items[0]["uploadId"] == "u1"
    assert items[0]["text"] == "Test document text"


def test_embed_empty_documents(aws_env, lambda_context):
    event = {"mode": "embed", "uploadId": "u1", "documents": []}
    result = handler(event, lambda_context)
    assert result["documentCount"] == 0


def test_embed_bedrock_failure_skips_document(aws_env, lambda_context):
    """When Bedrock invoke_model raises, the document is skipped (not crashed)."""
    mock_bedrock = MagicMock()
    mock_bedrock.invoke_model.side_effect = Exception("Bedrock throttle")

    with patch.object(_mod.boto3, "client", return_value=mock_bedrock):
        event = {
            "mode": "embed",
            "uploadId": "u1",
            "documents": [
                {"text": "Some text", "metadata": {}, "sourceType": "custom"},
            ],
        }
        result = handler(event, lambda_context)

    # Document skipped, no crash
    assert result["documentCount"] == 0

    # Nothing stored in DynamoDB
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Documents")
    items = table.scan()["Items"]
    assert len(items) == 0


def test_embed_bedrock_partial_failure(aws_env, lambda_context):
    """When Bedrock fails on one doc but succeeds on another, only the successful one is embedded."""
    fake_embedding = [0.1] * 256
    mock_bedrock = MagicMock()
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps({"embedding": fake_embedding}).encode()
    # First call fails, second succeeds
    mock_bedrock.invoke_model.side_effect = [
        Exception("Bedrock throttle"),
        {"body": mock_body},
    ]

    with patch.object(_mod.boto3, "client", return_value=mock_bedrock):
        event = {
            "mode": "embed",
            "uploadId": "u1",
            "documents": [
                {"text": "Doc one", "metadata": {}, "sourceType": "custom"},
                {"text": "Doc two", "metadata": {}, "sourceType": "custom"},
            ],
        }
        result = handler(event, lambda_context)

    assert result["documentCount"] == 1


def test_embed_truncates_long_text(aws_env, lambda_context):
    """Text longer than 8000 chars is truncated and a log message is emitted."""
    long_text = "A" * 9000
    fake_embedding = [0.1] * 256
    mock_bedrock = MagicMock()
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps({"embedding": fake_embedding}).encode()
    mock_bedrock.invoke_model.return_value = {"body": mock_body}

    with patch.object(_mod.boto3, "client", return_value=mock_bedrock), \
         patch.object(_mod, "logger") as mock_logger:
        event = {
            "mode": "embed",
            "uploadId": "u1",
            "documents": [
                {"text": long_text, "metadata": {}, "sourceType": "custom"},
            ],
        }
        result = handler(event, lambda_context)

        # Verify truncation log
        mock_logger.info.assert_any_call("Truncating document text", extra={"originalLen": 9000, "uploadId": "u1"})

    assert result["documentCount"] == 1

    # Verify the stored text is truncated
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Documents")
    items = table.scan()["Items"]
    assert len(items) == 1
    assert len(items[0]["text"]) == 8000


def test_embed_skips_empty_text(aws_env, lambda_context):
    fake_embedding = [0.1] * 256
    mock_bedrock = MagicMock()
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps({"embedding": fake_embedding}).encode()
    mock_bedrock.invoke_model.return_value = {"body": mock_body}

    with patch.object(_mod.boto3, "client", return_value=mock_bedrock):
        event = {
            "mode": "embed",
            "uploadId": "u1",
            "documents": [
                {"text": "", "metadata": {}, "sourceType": "custom"},
                {"text": "  ", "metadata": {}, "sourceType": "custom"},
                {"text": "Real content", "metadata": {}, "sourceType": "custom"},
            ],
        }
        result = handler(event, lambda_context)

    assert result["documentCount"] == 1


# ---- finalize mode ----

def test_finalize_updates_status(aws_env, lambda_context):
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("RA-Uploads")
    table.put_item(Item={"uploadId": "u1", "ingestionStatus": "processing"})

    event = {"mode": "finalize", "uploadId": "u1", "documentCount": 42}
    result = handler(event, lambda_context)

    assert result["status"] == "completed"
    assert result["documentCount"] == 42

    item = table.get_item(Key={"uploadId": "u1"}).get("Item")
    assert item["ingestionStatus"] == "completed"
    assert item["documentCount"] == 42


# ---- unknown / default mode ----

def test_unknown_mode(aws_env, lambda_context):
    with pytest.raises(ValueError, match="Unknown mode"):
        handler({"mode": "invalid"}, lambda_context)


def test_default_mode_is_detect(aws_env, lambda_context):
    """Test that missing mode defaults to detect."""
    result = handler({"uploadId": "u1", "s3Key": "test.txt", "sourceType": "auto"}, lambda_context)
    assert "detectedType" in result
