"""Update ticket — status transitions with state machine validation, optional note."""

import json
import os
import time
import boto3
from aws_lambda_powertools import Logger, Tracer
from ulid import ULID

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")

VALID_TRANSITIONS = {
    "new": {"triaging", "closed"},
    "triaging": {"investigating", "closed"},
    "investigating": {"active", "closed"},
    "active": {"completed", "closed"},
    "completed": {"closed"},
}


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Update ticket status with state machine validation and optional note."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    ticket_id = body.get("ticketId")
    new_status = body.get("status")
    assignee_id = body.get("assigneeId")
    note = body.get("note")

    if not ticket_id:
        return {"statusCode": 400, "body": json.dumps({"error": "ticketId is required"})}

    if not new_status and not assignee_id and not note:
        return {"statusCode": 400, "body": json.dumps({"error": "At least one of status, assigneeId, or note is required"})}

    tickets_table = dynamodb.Table(os.environ["TICKETS_TABLE"])
    now = int(time.time())

    # Fetch current ticket
    result = tickets_table.get_item(Key={"ticketId": ticket_id})
    ticket = result.get("Item")
    if not ticket:
        return {"statusCode": 404, "body": json.dumps({"error": "Ticket not found"})}

    # Validate status transition
    current_status = ticket["status"]
    if new_status:
        allowed = VALID_TRANSITIONS.get(current_status, set())
        if new_status not in allowed:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "error": f"Invalid transition: {current_status} -> {new_status}",
                    "allowedTransitions": sorted(allowed),
                }),
            }

    # Build update expression
    update_parts = ["#updatedAt = :updatedAt"]
    attr_names = {"#updatedAt": "updatedAt"}
    attr_values = {":updatedAt": now}

    if new_status:
        update_parts.append("#status = :status")
        attr_names["#status"] = "status"
        attr_values[":status"] = new_status

    if assignee_id:
        update_parts.append("#assigneeId = :assigneeId")
        attr_names["#assigneeId"] = "assigneeId"
        attr_values[":assigneeId"] = assignee_id

    update_expr = "SET " + ", ".join(update_parts)

    # Atomic status guard: ConditionExpression ensures the status hasn't changed
    # between our read and write, preventing race conditions.
    condition_expr = "#currentStatus = :expectedStatus"
    attr_names["#currentStatus"] = "status"
    attr_values[":expectedStatus"] = current_status

    try:
        updated = tickets_table.update_item(
            Key={"ticketId": ticket_id},
            UpdateExpression=update_expr,
            ConditionExpression=condition_expr,
            ExpressionAttributeNames=attr_names,
            ExpressionAttributeValues=attr_values,
            ReturnValues="ALL_NEW",
        )
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return {
            "statusCode": 409,
            "body": json.dumps({"error": "Ticket was modified concurrently. Please retry."}),
        }

    # Append note if provided
    if note:
        note_content = note.get("content", "")
        note_type = note.get("noteType", "comment")
        if note_content:
            note_id = str(ULID())
            notes_table = dynamodb.Table(os.environ["TICKET_NOTES_TABLE"])
            notes_table.put_item(Item={
                "ticketId": ticket_id,
                "noteId": note_id,
                "noteType": note_type,
                "content": note_content,
                "createdAt": now,
            })

    logger.info("Ticket updated", extra={"ticketId": ticket_id, "newStatus": new_status})

    return {
        "statusCode": 200,
        "body": json.dumps({"ticket": updated["Attributes"]}, default=str),
    }
