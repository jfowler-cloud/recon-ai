"""Get dashboard — aggregated dashboard data for a persona."""

import json
import os
from collections import Counter

import boto3
from aws_lambda_powertools import Logger, Tracer

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")


def _scan_all(table) -> list[dict]:
    """Paginated DynamoDB scan that follows LastEvaluatedKey."""
    items = []
    response = table.scan()
    items.extend(response.get("Items", []))
    while response.get("LastEvaluatedKey"):
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))
    return items


VALID_PERSONAS = {"osint-analyst", "red-team-analyst", "leadership"}

# Ticket types relevant to each persona
PERSONA_TICKET_TYPES = {
    "osint-analyst": {"osint-investigation", "escalation"},
    "red-team-analyst": {"red-team-operation", "escalation"},
    "leadership": {"osint-investigation", "red-team-operation", "escalation"},
}


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Return aggregated dashboard data for a persona."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    persona = body.get("persona")
    if persona not in VALID_PERSONAS:
        return {"statusCode": 400, "body": json.dumps({"error": f"Invalid persona: {persona}"})}

    uploads_table = dynamodb.Table(os.environ["UPLOADS_TABLE"])
    tickets_table = dynamodb.Table(os.environ["TICKETS_TABLE"])
    targets_table = dynamodb.Table(os.environ["TARGETS_TABLE"])

    # Fetch uploads (paginated)
    all_uploads = _scan_all(uploads_table)

    upload_status_counts = Counter(u.get("ingestionStatus", "unknown") for u in all_uploads)
    upload_source_counts = Counter(u.get("sourceType", "unknown") for u in all_uploads)

    # Recent uploads (last 10)
    sorted_uploads = sorted(all_uploads, key=lambda u: u.get("createdAt", 0), reverse=True)
    recent_uploads = sorted_uploads[:10]

    # Fetch tickets (paginated)
    all_tickets = _scan_all(tickets_table)

    # Filter by persona-relevant ticket types
    relevant_types = PERSONA_TICKET_TYPES[persona]
    relevant_tickets = [t for t in all_tickets if t.get("ticketType") in relevant_types]

    ticket_status_counts = Counter(t.get("status", "unknown") for t in relevant_tickets)
    ticket_severity_counts = Counter(t.get("severity", "unknown") for t in relevant_tickets)
    ticket_type_counts = Counter(t.get("ticketType", "unknown") for t in relevant_tickets)

    # Recent tickets (last 10)
    sorted_tickets = sorted(relevant_tickets, key=lambda t: t.get("updatedAt", 0), reverse=True)
    recent_tickets = sorted_tickets[:10]

    dashboard = {
        "persona": persona,
        "uploads": {
            "total": len(all_uploads),
            "byStatus": dict(upload_status_counts),
            "bySourceType": dict(upload_source_counts),
        },
        "tickets": {
            "total": len(relevant_tickets),
            "byStatus": dict(ticket_status_counts),
            "bySeverity": dict(ticket_severity_counts),
            "byType": dict(ticket_type_counts),
        },
        "recentUploads": recent_uploads,
        "recentTickets": recent_tickets,
    }

    # Leadership gets cross-domain target stats
    if persona == "leadership":
        all_targets = _scan_all(targets_table)
        target_status_counts = Counter(t.get("status", "unknown") for t in all_targets)
        dashboard["targets"] = {
            "total": len(all_targets),
            "byStatus": dict(target_status_counts),
        }

    logger.info("Dashboard generated", extra={"persona": persona})

    return {
        "statusCode": 200,
        "body": json.dumps(dashboard, default=str),
    }
