"""Get session — retrieve a chat session and its messages."""

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
    """Return a session's metadata and all messages."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    user_id = body.get("userId", "")
    session_id = body.get("sessionId", "")

    if not session_id:
        return {"statusCode": 400, "body": json.dumps({"error": "sessionId is required"})}

    if not user_id:
        return {"statusCode": 400, "body": json.dumps({"error": "userId is required"})}

    sessions_table = dynamodb.Table(os.environ["CHAT_SESSIONS_TABLE"])
    messages_table = dynamodb.Table(os.environ["CHAT_MESSAGES_TABLE"])

    action = body.get("action", "get")

    # Verify session ownership
    resp = sessions_table.get_item(Key={"userId": user_id, "sessionId": session_id})
    session = resp.get("Item")
    if not session:
        return {"statusCode": 404, "body": json.dumps({"error": "Session not found for this user"})}

    # Delete session and its messages
    if action == "delete":
        # Delete all messages for this session
        messages_resp = messages_table.query(
            KeyConditionExpression=Key("sessionId").eq(session_id),
            ProjectionExpression="sessionId, messageId",
        )
        with messages_table.batch_writer() as batch:
            for msg in messages_resp.get("Items", []):
                batch.delete_item(Key={"sessionId": msg["sessionId"], "messageId": msg["messageId"]})

        # Delete the session
        sessions_table.delete_item(Key={"userId": user_id, "sessionId": session_id})

        logger.info("Session deleted", extra={"session_id": session_id, "user_id": user_id})
        return {"statusCode": 200, "body": json.dumps({"deleted": True, "sessionId": session_id})}

    # Get all messages for this session
    messages_resp = messages_table.query(
        KeyConditionExpression=Key("sessionId").eq(session_id),
        ScanIndexForward=True,
    )
    messages = messages_resp.get("Items", [])
    messages = _decimal_to_native(messages)

    return {
        "statusCode": 200,
        "body": json.dumps({
            "session": _decimal_to_native(session),
            "messages": messages,
        }, default=str),
    }
