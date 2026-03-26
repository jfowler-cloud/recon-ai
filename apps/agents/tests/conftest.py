"""Shared fixtures for recon-ai agents tests."""

import os

import boto3
import pytest
from moto import mock_aws


@pytest.fixture(autouse=True)
def _env_vars(monkeypatch):
    """Set default environment variables for every test."""
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_SECURITY_TOKEN", "testing")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "testing")


@pytest.fixture()
def aws(monkeypatch):
    """Start moto mock_aws context and yield boto3 resource."""
    with mock_aws():
        yield


@pytest.fixture()
def dynamodb_resource(aws):
    """Provide a mocked DynamoDB resource."""
    return boto3.resource("dynamodb", region_name="us-east-1")


@pytest.fixture()
def sample_table(dynamodb_resource):
    """Create a simple test table and return its name."""
    table_name = "TestTable"
    dynamodb_resource.create_table(
        TableName=table_name,
        KeySchema=[
            {"AttributeName": "pk", "KeyType": "HASH"},
            {"AttributeName": "sk", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    return table_name
