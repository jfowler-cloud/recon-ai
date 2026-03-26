"""Create ticket — create RA-Tickets record and initial RA-TicketNotes entry."""

import json
import os
import time

import boto3
from aws_lambda_powertools import Logger, Tracer
from ulid import ULID

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")

VALID_TYPES = {"osint-investigation", "red-team-operation", "escalation"}
VALID_SEVERITIES = {"critical", "high", "medium", "low"}


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Create a ticket in RA-Tickets and an initial note in RA-TicketNotes."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    title = body.get("title")
    description = body.get("description", "")
    ticket_type = body.get("ticketType")
    severity = body.get("severity")
    assignee_id = body.get("assigneeId", "unassigned")
    target_id = body.get("targetId")

    # Validation
    if not title:
        return {"statusCode": 400, "body": json.dumps({"error": "title is required"})}
    if ticket_type not in VALID_TYPES:
        return {"statusCode": 400, "body": json.dumps({"error": f"Invalid ticketType: {ticket_type}"})}
    if severity not in VALID_SEVERITIES:
        return {"statusCode": 400, "body": json.dumps({"error": f"Invalid severity: {severity}"})}

    ticket_id = str(ULID())
    now = int(time.time())

    ticket = {
        "ticketId": ticket_id,
        "title": title,
        "description": description,
        "ticketType": ticket_type,
        "severity": severity,
        "status": "new",
        "assigneeId": assignee_id,
        "createdAt": now,
        "updatedAt": now,
    }
    if target_id:
        ticket["targetId"] = target_id

    tickets_table = dynamodb.Table(os.environ["TICKETS_TABLE"])
    tickets_table.put_item(Item=ticket)

    # Create initial note
    note_id = str(ULID())
    notes_table = dynamodb.Table(os.environ["TICKET_NOTES_TABLE"])
    notes_table.put_item(Item={
        "ticketId": ticket_id,
        "noteId": note_id,
        "noteType": "status-change",
        "content": "Ticket created",
        "createdAt": now,
    })

    logger.info("Ticket created", extra={"ticketId": ticket_id, "ticketType": ticket_type})

    return {
        "statusCode": 200,
        "body": json.dumps({"ticket": ticket}),
    }
