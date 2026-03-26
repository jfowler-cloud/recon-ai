"""Tests for shared.db module."""

import boto3
import pytest
from boto3.dynamodb.conditions import Key
from moto import mock_aws

import shared.db as db_mod


@pytest.fixture(autouse=True)
def _reset_db_singleton():
    """Reset the module-level DynamoDB singleton before each test."""
    db_mod._dynamodb = None
    yield
    db_mod._dynamodb = None


def test_get_dynamodb_returns_resource(aws):
    """get_dynamodb returns a DynamoDB ServiceResource."""
    ddb = db_mod.get_dynamodb()
    assert ddb is not None
    assert hasattr(ddb, "Table")


def test_get_dynamodb_is_singleton(aws):
    """get_dynamodb returns the same instance on repeated calls."""
    first = db_mod.get_dynamodb()
    second = db_mod.get_dynamodb()
    assert first is second


def test_query_table_empty(sample_table):
    """Querying a table with no matching items returns empty list."""
    result = db_mod.query_table(
        sample_table,
        Key("pk").eq("nonexistent"),
    )
    assert result == []


def test_query_table_returns_items(sample_table, dynamodb_resource):
    """query_table returns all matching items."""
    table = dynamodb_resource.Table(sample_table)
    table.put_item(Item={"pk": "user1", "sk": "doc1", "data": "hello"})
    table.put_item(Item={"pk": "user1", "sk": "doc2", "data": "world"})
    table.put_item(Item={"pk": "user2", "sk": "doc1", "data": "other"})

    result = db_mod.query_table(sample_table, Key("pk").eq("user1"))
    assert len(result) == 2
    pks = {item["pk"] for item in result}
    assert pks == {"user1"}


def test_query_table_with_kwargs(sample_table, dynamodb_resource):
    """query_table passes extra kwargs like FilterExpression."""
    table = dynamodb_resource.Table(sample_table)
    table.put_item(Item={"pk": "a", "sk": "1", "status": "active"})
    table.put_item(Item={"pk": "a", "sk": "2", "status": "closed"})

    from boto3.dynamodb.conditions import Attr

    result = db_mod.query_table(
        sample_table,
        Key("pk").eq("a"),
        FilterExpression=Attr("status").eq("active"),
    )
    assert len(result) == 1
    assert result[0]["status"] == "active"


def test_query_table_pagination(sample_table, dynamodb_resource):
    """query_table handles pagination across multiple pages."""
    table = dynamodb_resource.Table(sample_table)
    # Insert enough items to potentially paginate (moto may not paginate,
    # but we verify the logic works by inserting many items)
    for i in range(25):
        table.put_item(Item={"pk": "bulk", "sk": f"item-{i:04d}"})

    result = db_mod.query_table(sample_table, Key("pk").eq("bulk"))
    assert len(result) == 25


def test_scan_table_empty(sample_table):
    """Scanning an empty table returns empty list."""
    result = db_mod.scan_table(sample_table)
    assert result == []


def test_scan_table_returns_all_items(sample_table, dynamodb_resource):
    """scan_table returns all items in the table."""
    table = dynamodb_resource.Table(sample_table)
    table.put_item(Item={"pk": "a", "sk": "1"})
    table.put_item(Item={"pk": "b", "sk": "2"})
    table.put_item(Item={"pk": "c", "sk": "3"})

    result = db_mod.scan_table(sample_table)
    assert len(result) == 3


def test_scan_table_with_filter(sample_table, dynamodb_resource):
    """scan_table passes extra kwargs like FilterExpression."""
    table = dynamodb_resource.Table(sample_table)
    table.put_item(Item={"pk": "x", "sk": "1", "active": True})
    table.put_item(Item={"pk": "y", "sk": "2", "active": False})

    from boto3.dynamodb.conditions import Attr

    result = db_mod.scan_table(sample_table, FilterExpression=Attr("active").eq(True))
    assert len(result) == 1
    assert result[0]["pk"] == "x"


def test_scan_table_pagination(sample_table, dynamodb_resource):
    """scan_table handles pagination across multiple pages."""
    table = dynamodb_resource.Table(sample_table)
    for i in range(30):
        table.put_item(Item={"pk": f"p{i}", "sk": "s"})

    result = db_mod.scan_table(sample_table)
    assert len(result) == 30


def test_query_table_forced_pagination(aws):
    """query_table follows LastEvaluatedKey across pages (mocked pagination)."""
    from unittest.mock import MagicMock, patch

    page1 = {"Items": [{"pk": "a", "sk": "1"}], "LastEvaluatedKey": {"pk": "a", "sk": "1"}}
    page2 = {"Items": [{"pk": "a", "sk": "2"}]}

    mock_table = MagicMock()
    mock_table.query.side_effect = [page1, page2]

    mock_ddb = MagicMock()
    mock_ddb.Table.return_value = mock_table

    db_mod._dynamodb = mock_ddb

    result = db_mod.query_table("FakeTable", Key("pk").eq("a"))
    assert len(result) == 2
    assert mock_table.query.call_count == 2
    # Verify ExclusiveStartKey was passed on the second call
    second_call_kwargs = mock_table.query.call_args_list[1].kwargs
    assert second_call_kwargs["ExclusiveStartKey"] == {"pk": "a", "sk": "1"}


def test_scan_table_forced_pagination(aws):
    """scan_table follows LastEvaluatedKey across pages (mocked pagination)."""
    from unittest.mock import MagicMock

    page1 = {"Items": [{"pk": "x", "sk": "1"}], "LastEvaluatedKey": {"pk": "x", "sk": "1"}}
    page2 = {"Items": [{"pk": "y", "sk": "2"}], "LastEvaluatedKey": {"pk": "y", "sk": "2"}}
    page3 = {"Items": [{"pk": "z", "sk": "3"}]}

    mock_table = MagicMock()
    mock_table.scan.side_effect = [page1, page2, page3]

    mock_ddb = MagicMock()
    mock_ddb.Table.return_value = mock_table

    db_mod._dynamodb = mock_ddb

    result = db_mod.scan_table("FakeTable")
    assert len(result) == 3
    assert mock_table.scan.call_count == 3
