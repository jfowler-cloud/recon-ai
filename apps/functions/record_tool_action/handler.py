"""Record tool action — write to RA-ToolActions."""

import json
import os
import time

import boto3
from aws_lambda_powertools import Logger, Tracer
from ulid import ULID

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")

VALID_RESULT_STATUSES = {"success", "failure", "partial", "error", "pending"}


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Record a tool action in RA-ToolActions."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    ticket_id = body.get("ticketId")
    tool_name = body.get("toolName")
    tool_version = body.get("toolVersion", "")
    command = body.get("command", "")
    parameters = body.get("parameters", {})
    target_host = body.get("targetHost", "")
    result = body.get("result", "")
    result_status = body.get("resultStatus", "pending")
    executed_by = body.get("executedBy", "unknown")

    # Validation
    if not ticket_id:
        return {"statusCode": 400, "body": json.dumps({"error": "ticketId is required"})}
    if not tool_name:
        return {"statusCode": 400, "body": json.dumps({"error": "toolName is required"})}
    if result_status not in VALID_RESULT_STATUSES:
        return {"statusCode": 400, "body": json.dumps({"error": f"Invalid resultStatus: {result_status}"})}

    action_id = str(ULID())
    now = int(time.time())

    action = {
        "ticketId": ticket_id,
        "actionId": action_id,
        "toolName": tool_name,
        "toolVersion": tool_version,
        "command": command,
        "parameters": parameters,
        "targetHost": target_host,
        "result": result,
        "resultStatus": result_status,
        "executedBy": executed_by,
        "executionType": "manual",
        "createdAt": now,
    }

    table = dynamodb.Table(os.environ["TOOL_ACTIONS_TABLE"])
    table.put_item(Item=action)

    logger.info("Tool action recorded", extra={"ticketId": ticket_id, "actionId": action_id, "toolName": tool_name})

    return {
        "statusCode": 200,
        "body": json.dumps({"action": action}),
    }
