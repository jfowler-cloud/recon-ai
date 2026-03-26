"""DynamoDB helper functions for Recon AI agents."""

import boto3

_dynamodb = None


def get_dynamodb():
    """Get a shared DynamoDB resource (connection pooling)."""
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb")
    return _dynamodb


def query_table(table_name: str, key_condition, **kwargs) -> list[dict]:
    """Query a DynamoDB table with pagination."""
    table = get_dynamodb().Table(table_name)
    items = []
    response = table.query(KeyConditionExpression=key_condition, **kwargs)
    items.extend(response.get("Items", []))
    while response.get("LastEvaluatedKey"):
        response = table.query(
            KeyConditionExpression=key_condition,
            ExclusiveStartKey=response["LastEvaluatedKey"],
            **kwargs,
        )
        items.extend(response.get("Items", []))
    return items


def scan_table(table_name: str, **kwargs) -> list[dict]:
    """Scan a DynamoDB table with pagination."""
    table = get_dynamodb().Table(table_name)
    items = []
    response = table.scan(**kwargs)
    items.extend(response.get("Items", []))
    while response.get("LastEvaluatedKey"):
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"], **kwargs)
        items.extend(response.get("Items", []))
    return items
