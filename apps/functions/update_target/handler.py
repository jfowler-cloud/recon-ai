"""Update target — status transitions, manual field edits, merge enriched data.

Supports updating: status, name, description, category, severity, effort,
vulnerabilities, tags, notes. Enforces valid status transitions.
"""

import json
import os
import time

import boto3
from aws_lambda_powertools import Logger, Tracer
from decimal import Decimal

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")

VALID_STATUSES = {"queued", "enriched", "active", "in_progress", "completed", "cancelled"}

# Allowed status transitions (from -> set of valid next states)
STATUS_TRANSITIONS = {
    "queued": {"enriched", "active", "cancelled"},
    "enriched": {"active", "cancelled"},
    "active": {"in_progress", "completed", "cancelled"},
    "in_progress": {"active", "completed", "cancelled"},
    "completed": {"active"},  # allow re-opening
    "cancelled": {"queued"},  # allow re-queuing
}

UPDATABLE_FIELDS = [
    "name", "description", "category", "severity", "effort",
    "vulnerabilities", "tags", "notes", "assignee",
]


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Update target fields and/or status."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event
    target_id = body.get("targetId")
    if not target_id:
        return {"statusCode": 400, "body": json.dumps({"error": "targetId is required"})}

    table = dynamodb.Table(os.environ["TARGETS_TABLE"])
    resp = table.get_item(Key={"targetId": target_id})
    existing = resp.get("Item")
    if not existing:
        return {"statusCode": 404, "body": json.dumps({"error": f"Target {target_id} not found"})}

    now = int(time.time())
    updates = {}

    # Status transition
    new_status = body.get("status")
    if new_status:
        if new_status not in VALID_STATUSES:
            return {"statusCode": 400, "body": json.dumps({"error": f"Invalid status: {new_status}. Valid: {sorted(VALID_STATUSES)}"})}

        current_status = existing.get("status", "queued")
        allowed = STATUS_TRANSITIONS.get(current_status, set())
        if new_status not in allowed:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": f"Cannot transition from '{current_status}' to '{new_status}'. Allowed: {sorted(allowed)}"}),
            }
        updates["status"] = new_status

    # Field updates
    for field in UPDATABLE_FIELDS:
        if field in body:
            updates[field] = body[field]

    if not updates:
        return {"statusCode": 400, "body": json.dumps({"error": "No updatable fields provided"})}

    updates["updatedAt"] = now
    current_status = existing.get("status", "queued")

    # Build update expression
    expr_parts = []
    expr_names = {}
    expr_values = {}
    for i, (k, v) in enumerate(updates.items()):
        expr_parts.append(f"#f{i} = :v{i}")
        expr_names[f"#f{i}"] = k
        expr_values[f":v{i}"] = v

    # Atomic status guard: ConditionExpression ensures status hasn't changed
    # between our read and write, preventing race conditions.
    condition_expr = "#currentStatus = :expectedStatus"
    expr_names["#currentStatus"] = "status"
    expr_values[":expectedStatus"] = current_status

    try:
        table.update_item(
            Key={"targetId": target_id},
            UpdateExpression="SET " + ", ".join(expr_parts),
            ConditionExpression=condition_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
        )
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return {
            "statusCode": 409,
            "body": json.dumps({"error": "Target was modified concurrently. Please retry."}),
        }

    merged = {**existing, **updates}
    logger.info("Target updated", extra={"targetId": target_id, "updates": list(updates.keys())})
    return {"statusCode": 200, "body": json.dumps({"target": merged}, default=str)}
