"""Queue for red team — create a target in RA-Targets from an OSINT finding."""

import json
import os
import time

import boto3
from aws_lambda_powertools import Logger, Tracer
from ulid import ULID

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")

VALID_CATEGORIES = {"infrastructure", "application", "personnel", "network", "other"}


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Create a red team target from an OSINT finding."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    name = body.get("name")
    description = body.get("description", "")
    vulnerabilities = body.get("vulnerabilities", [])
    category = body.get("category", "other")
    source_ticket_id = body.get("sourceTicketId")

    if not name:
        return {"statusCode": 400, "body": json.dumps({"error": "name is required"})}

    if category not in VALID_CATEGORIES:
        return {"statusCode": 400, "body": json.dumps({"error": f"Invalid category: {category}"})}

    target_id = str(ULID())
    now = int(time.time())

    target = {
        "targetId": target_id,
        "name": name,
        "description": description,
        "vulnerabilities": vulnerabilities,
        "category": category,
        "status": "queued",
        "priorityScore": 0,
        "createdAt": now,
        "updatedAt": now,
    }
    if source_ticket_id:
        target["sourceTicketId"] = source_ticket_id

    targets_table = dynamodb.Table(os.environ["TARGETS_TABLE"])
    targets_table.put_item(Item=target)

    logger.info("Target queued for red team", extra={"targetId": target_id, "category": category})

    return {
        "statusCode": 200,
        "body": json.dumps({"target": target}),
    }
