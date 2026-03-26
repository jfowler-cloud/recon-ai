"""Update config — write runtime configuration."""

import json
import os
import time

import boto3
from aws_lambda_powertools import Logger, Tracer

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Write a config key-value pair."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    config_key = body.get("configKey")
    config_value = body.get("configValue")

    if not config_key:
        return {"statusCode": 400, "body": json.dumps({"error": "configKey is required"})}

    config_table = dynamodb.Table(os.environ["CONFIG_TABLE"])
    config_table.put_item(Item={
        "configKey": config_key,
        "configValue": config_value,
        "updatedAt": int(time.time()),
    })

    logger.info("Config updated", extra={"configKey": config_key})
    return {"statusCode": 200, "body": json.dumps({"message": f"Config '{config_key}' updated"})}
