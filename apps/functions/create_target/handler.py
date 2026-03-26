"""Create target — accept plain-text goal, create RA-Targets stub, start enrichment workflow."""

import json
import os
import time

import boto3
from aws_lambda_powertools import Logger, Tracer
from ulid import ULID

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")
sfn_client = boto3.client("stepfunctions")

VALID_CATEGORIES = {"infrastructure", "application", "personnel", "network", "other"}


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Create a red team target from a plain-text goal and start enrichment."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    plain_text_goal = body.get("plainTextGoal")
    category = body.get("category", "other")
    created_by = body.get("createdBy", "unknown")

    # Validation
    if not plain_text_goal:
        return {"statusCode": 400, "body": json.dumps({"error": "plainTextGoal is required"})}
    if category not in VALID_CATEGORIES:
        return {"statusCode": 400, "body": json.dumps({"error": f"Invalid category: {category}"})}

    target_id = str(ULID())
    now = int(time.time())

    target = {
        "targetId": target_id,
        "plainTextGoal": plain_text_goal,
        "category": category,
        "status": "queued",
        "priorityScore": 0,
        "createdBy": created_by,
        "createdAt": now,
        "updatedAt": now,
    }

    targets_table = dynamodb.Table(os.environ["TARGETS_TABLE"])
    targets_table.put_item(Item=target)

    # Start enrichment workflow
    workflow_arn = os.environ.get("ENRICHMENT_WORKFLOW_ARN", "")
    if workflow_arn:
        try:
            sfn_client.start_execution(
                stateMachineArn=workflow_arn,
                name=f"enrich-{target_id}",
                input=json.dumps({"targetId": target_id, "plainTextGoal": plain_text_goal}),
            )
            logger.info("Started enrichment workflow", extra={"targetId": target_id})
        except Exception:
            logger.exception("Failed to start enrichment workflow", extra={"targetId": target_id})

    logger.info("Target created", extra={"targetId": target_id, "category": category, "createdBy": created_by})

    return {
        "statusCode": 200,
        "body": json.dumps({"target": target}),
    }
