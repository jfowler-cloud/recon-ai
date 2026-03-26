"""Shared test configuration."""

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

import boto3
import pytest
from moto import mock_aws

# Disable Lambda Powertools tracing in tests
os.environ["POWERTOOLS_TRACE_DISABLED"] = "1"
os.environ["POWERTOOLS_METRICS_NAMESPACE"] = "ReconAI"

# Set AWS credentials + table env vars at module level so handler module-level
# boto3 resource/client calls succeed during import (before fixtures run).
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_SECURITY_TOKEN", "testing")
os.environ.setdefault("AWS_SESSION_TOKEN", "testing")
for _tbl_key, _tbl_val in {
    "DATA_SOURCES_TABLE": "RA-DataSources",
    "UPLOADS_TABLE": "RA-Uploads",
    "DOCUMENTS_TABLE": "RA-Documents",
    "TICKETS_TABLE": "RA-Tickets",
    "TICKET_NOTES_TABLE": "RA-TicketNotes",
    "TARGETS_TABLE": "RA-Targets",
    "LEADERSHIP_CONTEXT_TABLE": "RA-LeadershipContext",
    "TOOL_ACTIONS_TABLE": "RA-ToolActions",
    "TOOLS_TABLE": "RA-Tools",
    "CHAT_SESSIONS_TABLE": "RA-ChatSessions",
    "CHAT_MESSAGES_TABLE": "RA-ChatMessages",
    "CONFIG_TABLE": "RA-Config",
    "SCORING_HISTORY_TABLE": "RA-ScoringHistory",
    "UPLOADS_BUCKET": "recon-ai-uploads-test",
    "VECTORS_BUCKET": "recon-ai-vectors-test",
    "DEPLOYMENT_TIER": "testing",
    "BEDROCK_MODEL_ID": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "EMBEDDING_MODEL_ID": "amazon.titan-embed-text-v2:0",
    "TTL_DOCUMENTS_DAYS": "365",
    "TTL_SESSIONS_DAYS": "90",
    "COMPREHEND_ENRICHMENT": "true",
}.items():
    os.environ.setdefault(_tbl_key, _tbl_val)

# Add each Lambda handler directory to sys.path so relative imports work
# (e.g. `from adapters import get_adapter` in parse_upload/handler.py)
_functions_dir = Path(__file__).resolve().parent.parent
_tests_dir = Path(__file__).resolve().parent
if str(_tests_dir) not in sys.path:
    sys.path.insert(0, str(_tests_dir))
for handler_dir in _functions_dir.iterdir():
    if handler_dir.is_dir() and handler_dir.name not in ("tests", "__pycache__", ".venv", "layers"):
        if str(handler_dir) not in sys.path:
            sys.path.insert(0, str(handler_dir))



@pytest.fixture
def lambda_context():
    """Create a mock Lambda context."""
    context = MagicMock()
    context.function_name = "test-function"
    context.memory_limit_in_mb = 128
    context.invoked_function_arn = "arn:aws:lambda:us-east-1:123456789012:function:test"
    context.aws_request_id = "test-request-id"
    return context


@pytest.fixture(autouse=True)
def _env_vars(monkeypatch):
    """Set required environment variables for all tests."""
    env = {
        "AWS_DEFAULT_REGION": "us-east-1",
        "AWS_ACCESS_KEY_ID": "testing",
        "AWS_SECRET_ACCESS_KEY": "testing",
        "AWS_SECURITY_TOKEN": "testing",
        "AWS_SESSION_TOKEN": "testing",
        "DATA_SOURCES_TABLE": "RA-DataSources",
        "UPLOADS_TABLE": "RA-Uploads",
        "DOCUMENTS_TABLE": "RA-Documents",
        "TICKETS_TABLE": "RA-Tickets",
        "TICKET_NOTES_TABLE": "RA-TicketNotes",
        "TARGETS_TABLE": "RA-Targets",
        "LEADERSHIP_CONTEXT_TABLE": "RA-LeadershipContext",
        "TOOL_ACTIONS_TABLE": "RA-ToolActions",
        "TOOLS_TABLE": "RA-Tools",
        "CHAT_SESSIONS_TABLE": "RA-ChatSessions",
        "CHAT_MESSAGES_TABLE": "RA-ChatMessages",
        "CONFIG_TABLE": "RA-Config",
        "SCORING_HISTORY_TABLE": "RA-ScoringHistory",
        "UPLOADS_BUCKET": "recon-ai-uploads-test",
        "VECTORS_BUCKET": "recon-ai-vectors-test",
        "DEPLOYMENT_TIER": "testing",
        "BEDROCK_MODEL_ID": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        "EMBEDDING_MODEL_ID": "amazon.titan-embed-text-v2:0",
        "TTL_DOCUMENTS_DAYS": "365",
        "TTL_SESSIONS_DAYS": "90",
        "COMPREHEND_ENRICHMENT": "true",
    }
    for k, v in env.items():
        monkeypatch.setenv(k, v)


@pytest.fixture
def aws_env():
    """Provide mocked AWS with DynamoDB tables and S3 buckets."""
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        s3 = boto3.client("s3", region_name="us-east-1")

        # Tables
        ddb.create_table(
            TableName="RA-DataSources",
            KeySchema=[{"AttributeName": "sourceId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "sourceId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        ddb.create_table(
            TableName="RA-Uploads",
            KeySchema=[{"AttributeName": "uploadId", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "uploadId", "AttributeType": "S"},
                {"AttributeName": "analystId", "AttributeType": "S"},
                {"AttributeName": "createdAt", "AttributeType": "N"},
                {"AttributeName": "ingestionStatus", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {"IndexName": "AnalystIndex", "KeySchema": [{"AttributeName": "analystId", "KeyType": "HASH"}, {"AttributeName": "createdAt", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
                {"IndexName": "StatusIndex", "KeySchema": [{"AttributeName": "ingestionStatus", "KeyType": "HASH"}, {"AttributeName": "createdAt", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        ddb.create_table(
            TableName="RA-Documents",
            KeySchema=[{"AttributeName": "uploadId", "KeyType": "HASH"}, {"AttributeName": "documentId", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": "uploadId", "AttributeType": "S"}, {"AttributeName": "documentId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        ddb.create_table(
            TableName="RA-Config",
            KeySchema=[{"AttributeName": "configKey", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "configKey", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        # RA-Tickets with 4 GSIs
        ddb.create_table(
            TableName="RA-Tickets",
            KeySchema=[{"AttributeName": "ticketId", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "ticketId", "AttributeType": "S"},
                {"AttributeName": "assigneeId", "AttributeType": "S"},
                {"AttributeName": "updatedAt", "AttributeType": "N"},
                {"AttributeName": "status", "AttributeType": "S"},
                {"AttributeName": "ticketType", "AttributeType": "S"},
                {"AttributeName": "createdAt", "AttributeType": "N"},
                {"AttributeName": "targetId", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {"IndexName": "OwnerIndex", "KeySchema": [{"AttributeName": "assigneeId", "KeyType": "HASH"}, {"AttributeName": "updatedAt", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
                {"IndexName": "StatusIndex", "KeySchema": [{"AttributeName": "status", "KeyType": "HASH"}, {"AttributeName": "updatedAt", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
                {"IndexName": "TypeIndex", "KeySchema": [{"AttributeName": "ticketType", "KeyType": "HASH"}, {"AttributeName": "createdAt", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
                {"IndexName": "TargetIndex", "KeySchema": [{"AttributeName": "targetId", "KeyType": "HASH"}, {"AttributeName": "createdAt", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        # RA-TicketNotes
        ddb.create_table(
            TableName="RA-TicketNotes",
            KeySchema=[{"AttributeName": "ticketId", "KeyType": "HASH"}, {"AttributeName": "noteId", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": "ticketId", "AttributeType": "S"}, {"AttributeName": "noteId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        # RA-Targets with StatusIndex GSI
        ddb.create_table(
            TableName="RA-Targets",
            KeySchema=[{"AttributeName": "targetId", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "targetId", "AttributeType": "S"},
                {"AttributeName": "status", "AttributeType": "S"},
                {"AttributeName": "priorityScore", "AttributeType": "N"},
            ],
            GlobalSecondaryIndexes=[
                {"IndexName": "StatusIndex", "KeySchema": [{"AttributeName": "status", "KeyType": "HASH"}, {"AttributeName": "priorityScore", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        # RA-Tools with CategoryIndex and StatusIndex GSIs
        ddb.create_table(
            TableName="RA-Tools",
            KeySchema=[{"AttributeName": "toolId", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "toolId", "AttributeType": "S"},
                {"AttributeName": "category", "AttributeType": "S"},
                {"AttributeName": "createdAt", "AttributeType": "N"},
                {"AttributeName": "status", "AttributeType": "S"},
                {"AttributeName": "name", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {"IndexName": "CategoryIndex", "KeySchema": [{"AttributeName": "category", "KeyType": "HASH"}, {"AttributeName": "createdAt", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
                {"IndexName": "StatusIndex", "KeySchema": [{"AttributeName": "status", "KeyType": "HASH"}, {"AttributeName": "name", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        # Buckets
        s3.create_bucket(Bucket="recon-ai-uploads-test")
        s3.create_bucket(Bucket="recon-ai-vectors-test")

        yield ddb
