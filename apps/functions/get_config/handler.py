"""Get config — read runtime configuration and source status."""

import json
import os

import boto3
from aws_lambda_powertools import Logger, Tracer

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")


def _scan_all(table) -> list[dict]:
    """Scan a DynamoDB table with pagination."""
    items: list[dict] = []
    response = table.scan()
    items.extend(response.get("Items", []))
    while response.get("LastEvaluatedKey"):
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))
    return items


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Return config values and data source definitions."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    config_table = dynamodb.Table(os.environ["CONFIG_TABLE"])
    sources_table = dynamodb.Table(os.environ["DATA_SOURCES_TABLE"])

    config_key = body.get("configKey")
    if config_key:
        resp = config_table.get_item(Key={"configKey": config_key})
        item = resp.get("Item")
        return {"statusCode": 200, "body": json.dumps({"config": item}, default=str)}

    config_items = _scan_all(config_table)
    sources_items = _scan_all(sources_table)

    return {
        "statusCode": 200,
        "body": json.dumps({"config": config_items, "sources": sources_items}, default=str),
    }
