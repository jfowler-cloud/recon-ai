"""List sessions — return all chat sessions for a user."""

import json
import os
from decimal import Decimal

import boto3
from aws_lambda_powertools import Logger, Tracer
from boto3.dynamodb.conditions import Key

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")


def _decimal_to_native(obj):
    """Convert Decimal types from DynamoDB to int/float."""
    if isinstance(obj, Decimal):
        if not obj.is_finite():
            return None
        return int(obj) if obj == int(obj) else float(obj)
    if isinstance(obj, dict):
        return {k: _decimal_to_native(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_decimal_to_native(i) for i in obj]
    return obj


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Return all sessions for a given user, sorted by most recent."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    user_id = body.get("userId", "")

    if not user_id:
        return {"statusCode": 400, "body": json.dumps({"error": "userId is required"})}

    sessions_table = dynamodb.Table(os.environ["CHAT_SESSIONS_TABLE"])

    response = sessions_table.query(
        KeyConditionExpression=Key("userId").eq(user_id),
        ScanIndexForward=False,
    )
    sessions = response.get("Items", [])
    sessions = _decimal_to_native(sessions)

    return {
        "statusCode": 200,
        "body": json.dumps({"sessions": sessions}, default=str),
    }
