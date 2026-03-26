"""Trigger ingestion — start the RA-IngestionWorkflow or prepare sources list."""

import json
import os

import boto3
from aws_lambda_powertools import Logger, Tracer

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")


def _scan_all(table) -> list[dict]:
    """Scan a DynamoDB table with pagination."""
    items: list[dict] = []
    response = table.scan()
    items.extend(response.get("Items", []))
    while response.get("LastEvaluatedKey"):
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))
    return items


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Two modes:
    1. Called with manual=True: start the Step Functions workflow.
    2. Called by Step Functions: return sources list for Map state.
    """
    body = {}
    if isinstance(event.get("body"), str):
        try:
            body = json.loads(event["body"])
        except (json.JSONDecodeError, TypeError):
            return {"statusCode": 400, "body": json.dumps({"error": "Invalid JSON body"})}
    elif isinstance(event, dict) and event.get("manual"):
        body = event

    if body.get("manual"):
        workflow_arn = os.environ.get("INGESTION_WORKFLOW_ARN", "")
        if not workflow_arn:
            logger.error("INGESTION_WORKFLOW_ARN not configured")
            return {"statusCode": 500, "body": json.dumps({"error": "INGESTION_WORKFLOW_ARN not configured"})}

        sfn = boto3.client("stepfunctions")
        sfn.start_execution(
            stateMachineArn=workflow_arn,
            input=json.dumps({"manual": True}),
        )
        logger.info("Manual ingestion workflow started")
        return {"statusCode": 200, "body": json.dumps({"message": "Ingestion workflow started"})}

    sources_table = dynamodb.Table(os.environ["DATA_SOURCES_TABLE"])
    sources = _scan_all(sources_table)

    source_list = []
    for s in sources:
        source_list.append({
            "sourceId": s["sourceId"],
            "name": s.get("name", s["sourceId"]),
            "parser": s.get("parser", "text_passthrough"),
        })

    return {"sources": source_list}
