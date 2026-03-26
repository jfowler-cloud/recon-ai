"""List tickets — query by GSI or scan all tickets."""

import json
import os

import boto3
from aws_lambda_powertools import Logger, Tracer
from boto3.dynamodb.conditions import Key

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")

GSI_MAP = {
    "owner": ("OwnerIndex", "assigneeId"),
    "status": ("StatusIndex", "status"),
    "type": ("TypeIndex", "ticketType"),
    "target": ("TargetIndex", "targetId"),
}


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Query tickets by GSI or scan all tickets."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    query_by = body.get("queryBy")
    query_value = body.get("queryValue")
    limit = int(body.get("limit", 50))

    tickets_table = dynamodb.Table(os.environ["TICKETS_TABLE"])

    if query_by and query_value:
        if query_by not in GSI_MAP:
            return {"statusCode": 400, "body": json.dumps({"error": f"Invalid queryBy: {query_by}"})}

        index_name, pk_attr = GSI_MAP[query_by]
        response = tickets_table.query(
            IndexName=index_name,
            KeyConditionExpression=Key(pk_attr).eq(query_value),
            Limit=limit,
            ScanIndexForward=False,  # newest first
        )
    else:
        # Scan all tickets
        response = tickets_table.scan(Limit=limit)

    tickets = response.get("Items", [])
    # Sort by updatedAt descending for scan results
    tickets.sort(key=lambda t: t.get("updatedAt", 0), reverse=True)

    logger.info("Tickets listed", extra={"count": len(tickets), "queryBy": query_by})

    return {
        "statusCode": 200,
        "body": json.dumps({"tickets": tickets, "count": len(tickets)}, default=str),
    }
